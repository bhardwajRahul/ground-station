from datetime import datetime, timedelta, timezone

from celestial.scene import _build_pass_events_from_samples


def test_build_pass_events_extracts_crossing_window():
    start = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    samples = [
        {"time": start + timedelta(minutes=0), "az_deg": 10.0, "el_deg": -4.0},
        {"time": start + timedelta(minutes=1), "az_deg": 12.0, "el_deg": 2.0},
        {"time": start + timedelta(minutes=2), "az_deg": 18.0, "el_deg": 8.0},
        {"time": start + timedelta(minutes=3), "az_deg": 26.0, "el_deg": -1.0},
    ]
    row = {
        "target_key": "mission:Voyager 1",
        "target_type": "mission",
        "name": "Voyager 1",
        "command": "Voyager 1",
        "color": "#06D6A0",
        "source": "horizons",
        "cache": "db-hit",
        "stale": False,
    }

    events = _build_pass_events_from_samples(row=row, samples=samples, horizon_deg=0.0)

    assert len(events) == 1
    event = events[0]
    assert event["target_key"] == "mission:Voyager 1"
    assert event["peak_elevation_deg"] == 8.0
    assert event["estimated_start"] is False
    assert event["estimated_end"] is False
    assert event["duration_seconds"] > 0


def test_build_pass_events_handles_open_ended_pass():
    start = datetime(2026, 1, 1, 0, 0, tzinfo=timezone.utc)
    samples = [
        {"time": start + timedelta(minutes=0), "az_deg": 90.0, "el_deg": 3.0},
        {"time": start + timedelta(minutes=1), "az_deg": 95.0, "el_deg": 4.0},
        {"time": start + timedelta(minutes=2), "az_deg": 100.0, "el_deg": 2.0},
    ]
    row = {
        "target_key": "body:mars",
        "target_type": "body",
        "name": "Mars",
        "body_id": "mars",
        "source": "offline-solar-system",
        "cache": "offline",
        "stale": False,
    }

    events = _build_pass_events_from_samples(row=row, samples=samples, horizon_deg=0.0)

    assert len(events) == 1
    event = events[0]
    assert event["target_key"] == "body:mars"
    assert event["estimated_start"] is True
    assert event["estimated_end"] is True
    assert event["peak_elevation_deg"] == 4.0
