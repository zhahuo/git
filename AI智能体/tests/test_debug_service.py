from __future__ import annotations

import asyncio
import logging
import sqlite3
import tempfile
import unittest
from pathlib import Path

from agent.bus import AgentBus
from agent.config import AgentConfig
from agent.module import Module
from agent.services.debug_service import DebugService


class DummyModule(Module):
    name = "dummy"

    async def handle(self, event: dict) -> None:
        return None


class DebugServiceTests(unittest.IsolatedAsyncioTestCase):
    async def test_records_logs_events_and_module_status(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = AgentConfig(data_dir=Path(tmp))
            bus = AgentBus()
            dummy = DummyModule()
            await dummy.start()
            service = DebugService(
                config=config,
                bus=bus,
                modules=[dummy],
                status_interval=0.02,
            )
            await service.start()
            try:
                logging.getLogger("test.debug_service").warning("调试日志消息")
                await bus.apublish(
                    "user_message",
                    {"user_key": "u1", "message": "你好"},
                )
                await asyncio.sleep(0.08)

                conn = sqlite3.connect(str(service.store.db_path))
                try:
                    log_count = conn.execute(
                        "SELECT COUNT(*) FROM logs WHERE message = ?",
                        ("调试日志消息",),
                    ).fetchone()[0]
                    event_count = conn.execute(
                        "SELECT COUNT(*) FROM bus_events WHERE event_type = ?",
                        ("user_message",),
                    ).fetchone()[0]
                    status_row = conn.execute(
                        "SELECT status FROM module_status WHERE module = ?",
                        ("dummy",),
                    ).fetchone()
                finally:
                    conn.close()
                self.assertGreaterEqual(log_count, 1)
                self.assertGreaterEqual(event_count, 1)
                self.assertEqual(status_row, ("running",))
            finally:
                await service.stop()

    async def test_stop_removes_handler_and_marks_stopped(self) -> None:
        with tempfile.TemporaryDirectory() as tmp:
            config = AgentConfig(data_dir=Path(tmp))
            service = DebugService(config=config, bus=AgentBus())
            await service.start()
            handler_type = type(service._handler)
            self.assertTrue(
                any(
                    isinstance(handler, handler_type)
                    for handler in logging.getLogger().handlers
                )
            )
            await service.stop()
            self.assertFalse(
                any(
                    isinstance(handler, handler_type)
                    for handler in logging.getLogger().handlers
                )
            )
            self.assertFalse(service.running)

    def test_default_enabled_modules_include_debug(self) -> None:
        self.assertIn("debug", AgentConfig().enabled_modules)


if __name__ == "__main__":
    unittest.main()
