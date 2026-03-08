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

func runUpdateJob(svc *inkbridge.Service) {
	log.Println("Cron: Regenerating images...")
	svc.UpdateAllImages()
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
	_, err = scheduler.AddFunc(cfg.Global.CronSchedule, func() {
		runUpdateJob(svc)
	})
	if err != nil {
		return err
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
