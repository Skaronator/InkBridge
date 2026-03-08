package inkbridge

import (
	"context"
	"errors"
	"fmt"
	"log"
	"net/http"
	"sort"
	"strings"
	"time"
)

const serverShutdownTimeout = 15 * time.Second

func formatTimestamp(value time.Time) string {
	return value.Format("2006-01-02 15:04:05")
}

func (s *Service) createServer() *http.ServeMux {
	mux := http.NewServeMux()

	mux.HandleFunc("/", func(w http.ResponseWriter, r *http.Request) {
		if r.URL.Path != "/" {
			http.NotFound(w, r)
			return
		}

		items := make([]string, 0, len(s.cfg.Pages))
		for _, page := range s.cfg.Pages {
			entry, ok := s.getImage(page.Slug)
			generatedAt := "Not generated yet"
			if ok {
				generatedAt = "Generated at " + formatTimestamp(entry.GeneratedAt)
			}
			items = append(items, fmt.Sprintf(`<li><a href="/%s">/%s - %s</a></li>`, page.Slug, page.Slug, generatedAt))
		}

		sort.Strings(items)
		body := "<h1>InkBridge</h1><p>Available endpoints:</p><ul>" + strings.Join(items, "") + "</ul>"
		w.Header().Set("Content-Type", "text/html; charset=utf-8")
		_, _ = w.Write([]byte(body))
	})

	for _, page := range s.cfg.Pages {
		slug := page.Slug
		path := "/" + slug
		mux.HandleFunc(path, func(w http.ResponseWriter, r *http.Request) {
			if r.Method != http.MethodGet {
				http.Error(w, "Method not allowed", http.StatusMethodNotAllowed)
				return
			}

			entry, ok := s.getImage(slug)
			if !ok {
				http.Error(w, "Image not ready yet. Try again shortly.", http.StatusServiceUnavailable)
				return
			}

			w.Header().Set("Content-Type", "image/bmp")
			w.WriteHeader(http.StatusOK)
			_, _ = w.Write(entry.Buffer)
		})
	}

	return mux
}

func (s *Service) StartServer(ctx context.Context) error {
	host := s.cfg.Global.Host
	port := s.cfg.Global.Port
	addr := fmt.Sprintf("%s:%d", host, port)

	log.Printf("Server running at http://%s", addr)
	log.Println("Available endpoints:")
	for _, page := range s.cfg.Pages {
		log.Printf("- http://%s/%s", addr, page.Slug)
	}

	server := &http.Server{
		Addr:    addr,
		Handler: s.createServer(),
	}

	serverErr := make(chan error, 1)
	go func() {
		serverErr <- server.ListenAndServe()
	}()

	select {
	case err := <-serverErr:
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	case <-ctx.Done():
		shutdownCtx, cancel := context.WithTimeout(context.Background(), serverShutdownTimeout)
		defer cancel()
		if err := server.Shutdown(shutdownCtx); err != nil {
			return err
		}

		err := <-serverErr
		if err != nil && !errors.Is(err, http.ErrServerClosed) {
			return err
		}
		return nil
	}
}
