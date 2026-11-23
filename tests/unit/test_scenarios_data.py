"""
Модульні тести генератора біржових сценаріїв scenarios_data.py.
Перевірка безпеки прихованих свічок, розрахунку ROI та коректності індикаторів.
"""

import pytest
import scenarios_data


class TestScenariosData:
    """Тести для сценаріїв тренажера та функцій розрахунку розв'язки."""

    def test_get_all_scenarios_meta_security(self):
        """get_all_scenarios_meta() не розкриває futureCandles і містить рівно 40 свічок."""
        meta_list = scenarios_data.get_all_scenarios_meta()

        assert len(meta_list) > 0, "Список сценаріїв не повинен бути порожнім"

        for scen in meta_list:
            # Свічки майбутнього не повинні передаватися у браузер до прийняття рішення
            assert "futureCandles" not in scen, "Свічки майбутнього скомпрометовано в метаданих"
            assert "initialCandles" in scen
            assert len(scen["initialCandles"]) == 40, "Початковий відрізок повинен містити рівно 40 свічок"

            # Обов'язкові метадані
            assert "id" in scen
            assert "title" in scen
            assert "symbol" in scen
            assert "indicators" in scen
            assert "question" in scen

    def test_get_scenario_resolution_future_and_roi(self):
        """get_scenario_resolution() повертає 20 майбутніх свічок і правильний ROI."""
        # Генеруємо тестовий сценарій із відомим ID
        scen = scenarios_data.generate_fallback_scenario(1)
        scen_id = scen["id"]

        resolution = scenarios_data.get_scenario_resolution(scen_id)

        assert resolution["ok"] is True
        assert resolution["id"] == scen_id
        assert "futureCandles" in resolution
        assert len(resolution["futureCandles"]) == 20, "Розв'язка повинна містити рівно 20 свічок"

        assert resolution["correctAction"] in ["long", "short", "skip"]
        assert isinstance(resolution["longRoi"], float)
        assert isinstance(resolution["shortRoi"], float)

        # Якщо правильна дія Long -> longRoi > 0, а shortRoi < 0
        if resolution["correctAction"] == "long":
            assert resolution["longRoi"] >= 0.0
            assert resolution["shortRoi"] <= 0.0
        elif resolution["correctAction"] == "short":
            assert resolution["shortRoi"] >= 0.0
            assert resolution["longRoi"] <= 0.0

    def test_invalid_scenario_id_handling(self):
        """Некоректний scenarioId обробляється безпечно і повертає ok: false."""
        # Запит неіснуючого сценарію із scenarioId = 99
        res_99 = scenarios_data.get_scenario_resolution(99)
        assert res_99["ok"] is False
        assert "не знайдено" in res_99["error"]

        # Від'ємний ID
        res_neg = scenarios_data.get_scenario_resolution(-5)
        assert res_neg["ok"] is False

    def test_calculate_rsi_and_sma(self):
        """Перевірка функцій calculate_rsi та calculate_sma на тестових рядах."""
        # Постійно зростаючий тренд: RSI має бути високим (> 70)
        up_closes = [100.0 + i * 2.0 for i in range(25)]
        rsi_up = scenarios_data.calculate_rsi(up_closes, period=14)
        assert rsi_up > 70.0

        # Постійно спадний тренд: RSI має бути низьким (< 30)
        down_closes = [200.0 - i * 2.0 for i in range(25)]
        rsi_down = scenarios_data.calculate_rsi(down_closes, period=14)
        assert rsi_down < 30.0

        # Розрахунок SMA-20
        sma_val = scenarios_data.calculate_sma(up_closes, period=20)
        expected_sma = round(sum(up_closes[-20:]) / 20, 2)
        assert sma_val == expected_sma
