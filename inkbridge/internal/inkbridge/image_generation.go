package inkbridge

import (
	"bytes"
	"image"
	"log"
	"os"
	"runtime"
	"strconv"
	"sync"
	"time"

	"golang.org/x/image/bmp"
)

const defaultMaxRenderWorkers = 4

type imageCacheEntry struct {
	Buffer      []byte
	GeneratedAt time.Time
}

type renderOptions struct {
	Width       int
	Height      int
	RenderDelay int
	Zoom        float64
	ColorScheme ColorScheme
	DitherMode  DitherMode
}

type Service struct {
	cfg      AppConfig
	cache    map[string]imageCacheEntry
	cacheMu  sync.RWMutex
	updateMu sync.Mutex
}

func NewService(cfg AppConfig) *Service {
	return &Service{
		cfg:   cfg,
		cache: map[string]imageCacheEntry{},
	}
}

func createBMPBuffer(img image.Image) ([]byte, error) {
	var out bytes.Buffer
	if err := bmp.Encode(&out, img); err != nil {
		return nil, err
	}
	return out.Bytes(), nil
}

func (s *Service) effectiveRenderOptions(pageCfg PageConfig) renderOptions {
	width := s.cfg.Global.Width
	if pageCfg.Width != nil {
		width = *pageCfg.Width
	}

	height := s.cfg.Global.Height
	if pageCfg.Height != nil {
		height = *pageCfg.Height
	}

	renderDelay := s.cfg.Global.RenderDelay
	if pageCfg.RenderDelay != nil {
		renderDelay = *pageCfg.RenderDelay
	}

	zoom := s.cfg.Global.Zoom
	if pageCfg.Zoom != nil {
		zoom = *pageCfg.Zoom
	}

	colorScheme := s.cfg.Global.ColorScheme
	if pageCfg.ColorScheme != nil {
		colorScheme = *pageCfg.ColorScheme
	}

	ditherMode := s.cfg.Global.DitherMode
	if pageCfg.DitherMode != nil {
		ditherMode = *pageCfg.DitherMode
	}

	return renderOptions{
		Width:       width,
		Height:      height,
		RenderDelay: renderDelay,
		Zoom:        zoom,
		ColorScheme: colorScheme,
		DitherMode:  ditherMode,
	}
}

func (s *Service) generateImage(pageCfg PageConfig) error {
	renderCfg := s.effectiveRenderOptions(pageCfg)

	log.Printf("[%s] Capturing screenshot from %s...", pageCfg.Slug, pageCfg.URL)
	screenshot, err := captureScreenshot(
		pageCfg,
		renderCfg.Width,
		renderCfg.Height,
		renderCfg.RenderDelay,
		renderCfg.Zoom,
		s.cfg.HomeAssistant,
	)
	if err != nil {
		return err
	}

	log.Printf("[%s] Starting dithering with colorscheme %s and dither mode %s...", pageCfg.Slug, renderCfg.ColorScheme, renderCfg.DitherMode)
	dithered := DitherImage(screenshot, renderCfg.ColorScheme, renderCfg.DitherMode)

	log.Printf("[%s] Generating BMP in RAM...", pageCfg.Slug)
	bmpBuffer, err := createBMPBuffer(dithered)
	if err != nil {
		return err
	}

	s.cacheMu.Lock()
	s.cache[pageCfg.Slug] = imageCacheEntry{
		Buffer:      bmpBuffer,
		GeneratedAt: time.Now(),
	}
	s.cacheMu.Unlock()

	log.Printf("[%s] Image ready!", pageCfg.Slug)
	return nil
}

func (s *Service) UpdateAllImages() {
	s.updateMu.Lock()
	defer s.updateMu.Unlock()
	if len(s.cfg.Pages) == 0 {
		return
	}

	workerCount := s.renderWorkerCount()
	jobs := make(chan PageConfig)
	var wg sync.WaitGroup

	for i := 0; i < workerCount; i++ {
		wg.Add(1)
		go func() {
			defer wg.Done()
			for pageCfg := range jobs {
				if err := s.generateImage(pageCfg); err != nil {
					log.Printf("[%s] Failed to generate image: %v", pageCfg.Slug, err)
				}
			}
		}()
	}

	for _, pageCfg := range s.cfg.Pages {
		jobs <- pageCfg
	}
	close(jobs)
	wg.Wait()
}

func (s *Service) UpdatePageImage(pageCfg PageConfig) {
	s.updateMu.Lock()
	defer s.updateMu.Unlock()

	if err := s.generateImage(pageCfg); err != nil {
		log.Printf("[%s] Failed to generate image: %v", pageCfg.Slug, err)
	}
}

func (s *Service) getImage(slug string) (imageCacheEntry, bool) {
	s.cacheMu.RLock()
	entry, ok := s.cache[slug]
	s.cacheMu.RUnlock()
	return entry, ok
}

func (s *Service) renderWorkerCount() int {
	pageCount := len(s.cfg.Pages)
	if pageCount <= 1 {
		return 1
	}

	maxWorkers := defaultMaxRenderWorkers
	if raw := os.Getenv("INKBRIDGE_RENDER_WORKERS"); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			maxWorkers = n
		}
	}

	cpuLimit := runtime.NumCPU()
	if cpuLimit < 1 {
		cpuLimit = 1
	}

	workers := maxWorkers
	if workers > cpuLimit {
		workers = cpuLimit
	}
	if workers > pageCount {
		workers = pageCount
	}
	if workers < 1 {
		workers = 1
	}

	return workers
}
