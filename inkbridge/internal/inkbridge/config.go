package inkbridge

import (
	"bytes"
	"encoding/json"
	"fmt"
	"os"
	"path/filepath"
	"reflect"
	"strings"

	"github.com/go-playground/validator/v10"
	yaml "github.com/goccy/go-yaml"
	"github.com/robfig/cron/v3"
)

var optionsCandidatePaths = []string{
	"/data/options.json",
	"/data/options.yaml",
	"/data/options.yml",
}

type ColorScheme string

type DitherMode string

const (
	ColorSchemeMono        ColorScheme = "MONO"
	ColorSchemeBWR         ColorScheme = "BWR"
	ColorSchemeBWY         ColorScheme = "BWY"
	ColorSchemeBWRY        ColorScheme = "BWRY"
	ColorSchemeBWGBRY      ColorScheme = "BWGBRY"
	ColorSchemeGrayscale4  ColorScheme = "GRAYSCALE_4"
	ColorSchemeGrayscale8  ColorScheme = "GRAYSCALE_8"
	ColorSchemeGrayscale16 ColorScheme = "GRAYSCALE_16"
)

const (
	DitherModeNone              DitherMode = "NONE"
	DitherModeBurkes            DitherMode = "BURKES"
	DitherModeFloydSteinberg    DitherMode = "FLOYD_STEINBERG"
	DitherModeAtkinson          DitherMode = "ATKINSON"
	DitherModeStucki            DitherMode = "STUCKI"
	DitherModeSierra            DitherMode = "SIERRA"
	DitherModeJarvisJudiceNinke DitherMode = "JARVIS_JUDICE_NINKE"
)

type GlobalConfig struct {
	Host         string      `json:"host" yaml:"host" validate:"required"`
	Port         int         `json:"port" yaml:"port" validate:"required,min=1,max=65535"`
	Width        int         `json:"width" yaml:"width" validate:"required,min=1,max=10000"`
	Height       int         `json:"height" yaml:"height" validate:"required,min=1,max=10000"`
	ColorScheme  ColorScheme `json:"colorscheme" yaml:"colorscheme" validate:"required,colorscheme"`
	DitherMode   DitherMode  `json:"dither_mode" yaml:"dither_mode" validate:"required,dithermode"`
	CronSchedule string      `json:"cron_schedule" yaml:"cron_schedule" validate:"required,cron"`
	RenderDelay  int         `json:"render_delay" yaml:"render_delay" validate:"required,min=0,max=30000"`
	Zoom         float64     `json:"zoom" yaml:"zoom" validate:"required,gt=0,lte=10"`
}

type HomeAssistantConfig struct {
	URL      string `json:"url" yaml:"url" validate:"required,url"`
	Token    string `json:"token" yaml:"token" validate:"required"`
	Language string `json:"language" yaml:"language" validate:"required"`
}

type PageConfig struct {
	Slug         string       `json:"slug" yaml:"slug" validate:"required"`
	URL          string       `json:"url" yaml:"url" validate:"required,url"`
	Width        *int         `json:"width,omitempty" yaml:"width,omitempty" validate:"omitempty,min=1,max=10000"`
	Height       *int         `json:"height,omitempty" yaml:"height,omitempty" validate:"omitempty,min=1,max=10000"`
	ColorScheme  *ColorScheme `json:"colorscheme,omitempty" yaml:"colorscheme,omitempty" validate:"omitempty,colorscheme"`
	DitherMode   *DitherMode  `json:"dither_mode,omitempty" yaml:"dither_mode,omitempty" validate:"omitempty,dithermode"`
	CronSchedule *string      `json:"cron_schedule,omitempty" yaml:"cron_schedule,omitempty" validate:"omitempty,cron"`
	RenderDelay  *int         `json:"render_delay,omitempty" yaml:"render_delay,omitempty" validate:"omitempty,min=0,max=30000"`
	Zoom         *float64     `json:"zoom,omitempty" yaml:"zoom,omitempty" validate:"omitempty,gt=0,lte=10"`
}

type AppConfig struct {
	Global        GlobalConfig        `json:"global" yaml:"global" validate:"required"`
	HomeAssistant HomeAssistantConfig `json:"home_assistant" yaml:"home_assistant" validate:"required"`
	Pages         []PageConfig        `json:"pages" yaml:"pages" validate:"required,min=1,dive"`
}

func LoadConfig() (AppConfig, error) {
	path, data, err := readConfigFile()
	if err != nil {
		return AppConfig{}, err
	}

	var cfg AppConfig
	if err := decodeConfigByExtension(path, data, &cfg); err != nil {
		return AppConfig{}, err
	}

	normalizeConfig(&cfg)
	if err := validateConfig(cfg); err != nil {
		return AppConfig{}, err
	}

	return cfg, nil
}

func readConfigFile() (string, []byte, error) {
	for _, path := range optionsCandidatePaths {
		data, err := os.ReadFile(path)
		if err == nil {
			return path, data, nil
		}
		if !os.IsNotExist(err) {
			return "", nil, err
		}
	}

	return "", nil, fmt.Errorf("[config] no config file found. Tried: %s", strings.Join(optionsCandidatePaths, ", "))
}

func decodeConfigByExtension(path string, data []byte, out *AppConfig) error {
	ext := strings.ToLower(filepath.Ext(path))
	switch ext {
	case ".yaml", ".yml":
		if err := yaml.Unmarshal(data, out); err != nil {
			return fmt.Errorf("[config] Invalid YAML in %s: %w", path, err)
		}
	default:
		decoder := json.NewDecoder(bytes.NewReader(data))
		decoder.DisallowUnknownFields()
		if err := decoder.Decode(out); err != nil {
			return fmt.Errorf("[config] Invalid JSON in %s: %w", path, err)
		}
	}

	return nil
}

func normalizeConfig(cfg *AppConfig) {
	cfg.Global.Host = strings.TrimSpace(cfg.Global.Host)
	cfg.Global.CronSchedule = strings.TrimSpace(cfg.Global.CronSchedule)

	cfg.HomeAssistant.URL = strings.TrimSpace(cfg.HomeAssistant.URL)
	cfg.HomeAssistant.Token = strings.TrimSpace(cfg.HomeAssistant.Token)
	cfg.HomeAssistant.Language = strings.TrimSpace(cfg.HomeAssistant.Language)

	for i := range cfg.Pages {
		cfg.Pages[i].Slug = strings.TrimSpace(cfg.Pages[i].Slug)
		cfg.Pages[i].URL = strings.TrimSpace(cfg.Pages[i].URL)
		if cfg.Pages[i].CronSchedule != nil {
			trimmed := strings.TrimSpace(*cfg.Pages[i].CronSchedule)
			cfg.Pages[i].CronSchedule = &trimmed
		}
	}
}

func validateConfig(cfg AppConfig) error {
	v := validator.New()
	v.RegisterTagNameFunc(func(field reflect.StructField) string {
		name := strings.SplitN(field.Tag.Get("json"), ",", 2)[0]
		if name == "" || name == "-" {
			return field.Name
		}
		return name
	})

	if err := v.RegisterValidation("cron", func(fl validator.FieldLevel) bool {
		expr := strings.TrimSpace(fl.Field().String())
		if expr == "" {
			return false
		}
		_, err := cron.ParseStandard(expr)
		return err == nil
	}); err != nil {
		return fmt.Errorf("[config] failed to initialize cron validator: %w", err)
	}

	if err := v.RegisterValidation("colorscheme", func(fl validator.FieldLevel) bool {
		value := ColorScheme(strings.TrimSpace(fl.Field().String()))
		return IsSupportedColorScheme(value)
	}); err != nil {
		return fmt.Errorf("[config] failed to initialize colorscheme validator: %w", err)
	}

	if err := v.RegisterValidation("dithermode", func(fl validator.FieldLevel) bool {
		value := DitherMode(strings.TrimSpace(fl.Field().String()))
		return IsSupportedDitherMode(value)
	}); err != nil {
		return fmt.Errorf("[config] failed to initialize dither mode validator: %w", err)
	}

	if err := v.Struct(cfg); err != nil {
		if validationErrors, ok := err.(validator.ValidationErrors); ok {
			errors := make([]string, 0, len(validationErrors))
			for _, fieldErr := range validationErrors {
				errors = append(errors, fmt.Sprintf("%s failed '%s'", fieldErr.Namespace(), fieldErr.Tag()))
			}
			return fmt.Errorf("[config] validation failed: %s", strings.Join(errors, "; "))
		}
		return fmt.Errorf("[config] validation failed: %w", err)
	}

	return nil
}
