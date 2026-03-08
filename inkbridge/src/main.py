from apscheduler.schedulers.background import BackgroundScheduler
from apscheduler.triggers.cron import CronTrigger

from config import load_config
from image_generation import update_all_images
from server import start_server


def _run_update_job(config) -> None:
    print("Cron: Regenerating images...")
    update_all_images(config)


def start() -> None:
    config = load_config()

    print("Starting initial image generation...")
    update_all_images(config)

    scheduler = BackgroundScheduler()
    scheduler.add_job(
        _run_update_job,
        CronTrigger.from_crontab(config.global_config.cron_schedule),
        args=[config],
        max_instances=1,
        coalesce=True,
        misfire_grace_time=30,
    )
    scheduler.start()

    try:
        start_server(config)
    finally:
        scheduler.shutdown(wait=False)


if __name__ == "__main__":
    try:
        start()
    except Exception as error:
        print(f"Failed to start InkBridge: {error}")
        raise
