package inkbridge

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"image"
	_ "image/jpeg"
	_ "image/png"
	"net/url"
	"strings"
	"time"

	"github.com/chromedp/cdproto/emulation"
	"github.com/chromedp/cdproto/page"
	"github.com/chromedp/chromedp"
)

const screenshotTimeout = 2 * time.Minute

func captureScreenshot(pageCfg PageConfig, width, height, renderDelay int, zoom float64, haCfg HomeAssistantConfig) (image.Image, error) {
	allocOpts := append(chromedp.DefaultExecAllocatorOptions[:],
		chromedp.ExecPath("/usr/bin/chromium"),
		chromedp.Flag("no-sandbox", true),
		chromedp.Flag("disable-setuid-sandbox", true),
		chromedp.Flag("headless", true),
		chromedp.Flag("disable-gpu", true),
	)

	allocCtx, cancelAlloc := chromedp.NewExecAllocator(context.Background(), allocOpts...)
	defer cancelAlloc()

	ctx, cancelCtx := chromedp.NewContext(allocCtx)
	defer cancelCtx()

	timeoutCtx, cancelTimeout := context.WithTimeout(ctx, screenshotTimeout)
	defer cancelTimeout()

	navigateTarget := strings.TrimSpace(pageCfg.URL)
	if navigateTarget == "" {
		return nil, fmt.Errorf("empty page URL for slug %s", pageCfg.Slug)
	}

	actions := []chromedp.Action{
		emulation.SetDeviceMetricsOverride(int64(width), int64(height), 1.0, false),
	}

	if shouldInjectHomeAssistantAuth(navigateTarget, haCfg.URL) {
		origin, err := originURL(haCfg.URL)
		if err != nil {
			return nil, fmt.Errorf("invalid home_assistant.url: %w", err)
		}

		hassTokens := map[string]string{
			"hassUrl":      haCfg.URL,
			"access_token": haCfg.Token,
			"token_type":   "Bearer",
		}
		tokensJSON, _ := json.Marshal(hassTokens)
		langJSON, _ := json.Marshal(haCfg.Language)

		actions = append(actions,
			chromedp.Navigate(origin),
			chromedp.WaitReady("body", chromedp.ByQuery),
			chromedp.Evaluate(fmt.Sprintf("localStorage.setItem('hassTokens', %q);", string(tokensJSON)), nil),
			chromedp.Evaluate(fmt.Sprintf("localStorage.setItem('selectedLanguage', %q);", string(langJSON)), nil),
		)
	}

	actions = append(actions,
		chromedp.Navigate(navigateTarget),
		chromedp.WaitReady("body", chromedp.ByQuery),
		chromedp.Evaluate(fmt.Sprintf("if (document.body) { document.body.style.zoom = '%g'; }", zoom), nil),
	)
	if renderDelay > 0 {
		actions = append(actions, chromedp.Sleep(time.Duration(renderDelay)*time.Millisecond))
	}

	var pngBytes []byte
	actions = append(actions, chromedp.ActionFunc(func(ctx context.Context) error {
		buf, err := page.CaptureScreenshot().WithFormat(page.CaptureScreenshotFormatPng).Do(ctx)
		if err != nil {
			return err
		}
		pngBytes = buf
		return nil
	}))

	if err := chromedp.Run(timeoutCtx, actions...); err != nil {
		return nil, err
	}

	img, _, err := image.Decode(bytes.NewReader(pngBytes))
	if err != nil {
		return nil, fmt.Errorf("failed decoding screenshot PNG: %w", err)
	}

	return img, nil
}

func shouldInjectHomeAssistantAuth(pageURL, hassURL string) bool {
	pageParsed, err := url.Parse(pageURL)
	if err != nil {
		return false
	}
	hassParsed, err := url.Parse(hassURL)
	if err != nil {
		return false
	}
	return strings.EqualFold(pageParsed.Hostname(), hassParsed.Hostname())
}

func originURL(raw string) (string, error) {
	u, err := url.Parse(raw)
	if err != nil {
		return "", err
	}
	if u.Scheme == "" || u.Host == "" {
		return "", fmt.Errorf("missing scheme or host")
	}
	return u.Scheme + "://" + u.Host, nil
}
