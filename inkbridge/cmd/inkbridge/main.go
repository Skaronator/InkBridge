package main

import (
	"context"
	"log"
	"os"
	"os/signal"
	"syscall"

	"github.com/robfig/cron/v3"
	"inkbridge/internal/inkbridge"
)

func pageSchedule(pageCfg inkbridge.PageConfig, fallback string) string {
	if pageCfg.CronSchedule != nil {
		return *pageCfg.CronSchedule
	}
	return fallback
}

func runPageUpdateJob(svc *inkbridge.Service, pageCfg inkbridge.PageConfig, schedule string) {
	log.Printf("Cron [%s]: Regenerating image (schedule: %s)...", pageCfg.Slug, schedule)
	svc.UpdatePageImage(pageCfg)
}

func start() error {
	ctx, stopSignals := signal.NotifyContext(context.Background(), os.Interrupt, syscall.SIGTERM)
	defer stopSignals()

	cfg, err := inkbridge.LoadConfig()
	if err != nil {
		return err
	}
	svc := inkbridge.NewService(cfg)

	log.Println("Starting initial image generation...")
	svc.UpdateAllImages()

	scheduler := cron.New()
	for _, pageCfg := range cfg.Pages {
		pageCfg := pageCfg
		schedule := pageSchedule(pageCfg, cfg.Global.CronSchedule)
		_, err = scheduler.AddFunc(schedule, func() {
			runPageUpdateJob(svc, pageCfg, schedule)
		})
		if err != nil {
			return err
		}
	}
	scheduler.Start()
	defer scheduler.Stop()

	return svc.StartServer(ctx)
}

func main() {
	if err := start(); err != nil {
		log.Printf("Failed to start InkBridge: %v", err)
		panic(err)
	}
}
