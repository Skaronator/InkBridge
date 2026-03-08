package inkbridge

import (
	"image"
	"image/color"
	"math"
)

type rgb struct {
	r float64
	g float64
	b float64
}

type kernelOffset struct {
	dx     int
	dy     int
	weight float64
}

type errorKernel struct {
	divisor float64
	offsets []kernelOffset
}

var kernels = map[DitherMode]errorKernel{
	DitherModeFloydSteinberg: {
		divisor: 16,
		offsets: []kernelOffset{{1, 0, 7}, {-1, 1, 3}, {0, 1, 5}, {1, 1, 1}},
	},
	DitherModeBurkes: {
		divisor: 32,
		offsets: []kernelOffset{{1, 0, 8}, {2, 0, 4}, {-2, 1, 2}, {-1, 1, 4}, {0, 1, 8}, {1, 1, 4}, {2, 1, 2}},
	},
	DitherModeSierra: {
		divisor: 32,
		offsets: []kernelOffset{{1, 0, 5}, {2, 0, 3}, {-2, 1, 2}, {-1, 1, 4}, {0, 1, 5}, {1, 1, 4}, {2, 1, 2}, {-1, 2, 2}, {0, 2, 3}, {1, 2, 2}},
	},
	DitherModeAtkinson: {
		divisor: 8,
		offsets: []kernelOffset{{1, 0, 1}, {2, 0, 1}, {-1, 1, 1}, {0, 1, 1}, {1, 1, 1}, {0, 2, 1}},
	},
	DitherModeStucki: {
		divisor: 42,
		offsets: []kernelOffset{{1, 0, 8}, {2, 0, 4}, {-2, 1, 2}, {-1, 1, 4}, {0, 1, 8}, {1, 1, 4}, {2, 1, 2}, {-2, 2, 1}, {-1, 2, 2}, {0, 2, 4}, {1, 2, 2}, {2, 2, 1}},
	},
	DitherModeJarvisJudiceNinke: {
		divisor: 48,
		offsets: []kernelOffset{{1, 0, 7}, {2, 0, 5}, {-2, 1, 3}, {-1, 1, 5}, {0, 1, 7}, {1, 1, 5}, {2, 1, 3}, {-2, 2, 1}, {-1, 2, 3}, {0, 2, 5}, {1, 2, 3}, {2, 2, 1}},
	},
}

func paletteForScheme(s ColorScheme) (color.Palette, bool) {
	switch s {
	case ColorSchemeMono:
		return color.Palette{color.RGBA{0, 0, 0, 255}, color.RGBA{255, 255, 255, 255}}, true
	case ColorSchemeBWR:
		return color.Palette{color.RGBA{0, 0, 0, 255}, color.RGBA{255, 255, 255, 255}, color.RGBA{255, 0, 0, 255}}, true
	case ColorSchemeBWY:
		return color.Palette{color.RGBA{0, 0, 0, 255}, color.RGBA{255, 255, 255, 255}, color.RGBA{255, 255, 0, 255}}, true
	case ColorSchemeBWRY:
		return color.Palette{color.RGBA{0, 0, 0, 255}, color.RGBA{255, 255, 255, 255}, color.RGBA{255, 255, 0, 255}, color.RGBA{255, 0, 0, 255}}, true
	case ColorSchemeBWGBRY:
		return color.Palette{color.RGBA{0, 0, 0, 255}, color.RGBA{255, 255, 255, 255}, color.RGBA{255, 255, 0, 255}, color.RGBA{255, 0, 0, 255}, color.RGBA{0, 0, 255, 255}, color.RGBA{0, 255, 0, 255}}, true
	case ColorSchemeGrayscale4:
		return grayscalePalette(4), true
	case ColorSchemeGrayscale8:
		return grayscalePalette(8), true
	case ColorSchemeGrayscale16:
		return grayscalePalette(16), true
	default:
		return color.Palette{}, false
	}
}

func grayscalePalette(levels int) color.Palette {
	if levels < 2 {
		return color.Palette{color.RGBA{0, 0, 0, 255}, color.RGBA{255, 255, 255, 255}}
	}

	palette := make(color.Palette, 0, levels)
	for i := 0; i < levels; i++ {
		v := uint8(math.Round(float64(i) * 255.0 / float64(levels-1)))
		palette = append(palette, color.RGBA{v, v, v, 255})
	}

	return palette
}

func IsSupportedColorScheme(s ColorScheme) bool {
	_, ok := paletteForScheme(s)
	return ok
}

func IsSupportedDitherMode(mode DitherMode) bool {
	if mode == DitherModeNone {
		return true
	}
	_, ok := kernels[mode]
	return ok
}

func DitherImage(src image.Image, scheme ColorScheme, mode DitherMode) *image.Paletted {
	palette, ok := paletteForScheme(scheme)
	if !ok {
		palette, _ = paletteForScheme(ColorSchemeMono)
	}
	bounds := src.Bounds()
	out := image.NewPaletted(bounds, palette)

	switch mode {
	case DitherModeNone:
		directMap(src, out)
	default:
		kernel, ok := kernels[mode]
		if !ok {
			kernel = kernels[DitherModeBurkes]
		}
		errorDiffusion(src, out, kernel, true)
	}

	return out
}

func directMap(src image.Image, out *image.Paletted) {
	bounds := src.Bounds()
	for y := bounds.Min.Y; y < bounds.Max.Y; y++ {
		for x := bounds.Min.X; x < bounds.Max.X; x++ {
			r, g, b := toLinearRGB(src.At(x, y))
			idx := closestPaletteIndex(r, g, b, out.Palette)
			out.SetColorIndex(x, y, uint8(idx))
		}
	}
}

func errorDiffusion(src image.Image, out *image.Paletted, kernel errorKernel, serpentine bool) {
	bounds := src.Bounds()
	width := bounds.Dx()
	height := bounds.Dy()

	buf := make([][]rgb, height)
	for y := 0; y < height; y++ {
		row := make([]rgb, width)
		for x := 0; x < width; x++ {
			r, g, b := toLinearRGB(src.At(bounds.Min.X+x, bounds.Min.Y+y))
			row[x] = rgb{r, g, b}
		}
		buf[y] = row
	}

	for y := 0; y < height; y++ {
		reverse := serpentine && y%2 == 1
		if reverse {
			for x := width - 1; x >= 0; x-- {
				quantizeAndDiffuse(buf, out, x, y, bounds, kernel, true)
			}
		} else {
			for x := 0; x < width; x++ {
				quantizeAndDiffuse(buf, out, x, y, bounds, kernel, false)
			}
		}
	}
}

func quantizeAndDiffuse(buf [][]rgb, out *image.Paletted, x, y int, bounds image.Rectangle, kernel errorKernel, reverse bool) {
	pixel := buf[y][x]
	pixel.r = clamp01(pixel.r)
	pixel.g = clamp01(pixel.g)
	pixel.b = clamp01(pixel.b)

	idx := closestPaletteIndex(pixel.r, pixel.g, pixel.b, out.Palette)
	out.SetColorIndex(bounds.Min.X+x, bounds.Min.Y+y, uint8(idx))

	pr, pg, pb := toLinearRGB(out.Palette[idx])
	errR := pixel.r - pr
	errG := pixel.g - pg
	errB := pixel.b - pb

	for _, off := range kernel.offsets {
		dx := off.dx
		if reverse {
			dx = -dx
		}
		nx := x + dx
		ny := y + off.dy
		if nx >= 0 && nx < len(buf[0]) && ny >= 0 && ny < len(buf) {
			n := off.weight / kernel.divisor
			buf[ny][nx].r += errR * n
			buf[ny][nx].g += errG * n
			buf[ny][nx].b += errB * n
		}
	}
}

func closestPaletteIndex(r, g, b float64, palette color.Palette) int {
	bestIdx := 0
	bestDist := math.MaxFloat64

	for i, c := range palette {
		pr, pg, pb := toLinearRGB(c)
		dr := r - pr
		dg := g - pg
		db := b - pb
		dist := dr*dr + dg*dg + db*db
		if dist < bestDist {
			bestDist = dist
			bestIdx = i
		}
	}

	return bestIdx
}

func toLinearRGB(c color.Color) (float64, float64, float64) {
	r16, g16, b16, a16 := c.RGBA()
	r := float64(r16>>8) / 255.0
	g := float64(g16>>8) / 255.0
	b := float64(b16>>8) / 255.0
	a := float64(a16>>8) / 255.0

	if a < 1.0 {
		// Composite transparency onto white, matching e-paper background assumptions.
		r = r*a + (1.0-a)*1.0
		g = g*a + (1.0-a)*1.0
		b = b*a + (1.0-a)*1.0
	}

	return srgbToLinear(r), srgbToLinear(g), srgbToLinear(b)
}

func srgbToLinear(v float64) float64 {
	if v <= 0.04045 {
		return v / 12.92
	}
	return math.Pow((v+0.055)/1.055, 2.4)
}

func clamp01(v float64) float64 {
	if v < 0 {
		return 0
	}
	if v > 1 {
		return 1
	}
	return v
}
