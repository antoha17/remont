#!/usr/bin/env python3
"""Тестовый прайс (выдуманные данные) с нестандартными заголовками и строками-разделами."""
import sys
from openpyxl import Workbook
out = sys.argv[1] if len(sys.argv) > 1 else "/tmp/prices.xlsx"
wb = Workbook(); ws = wb.active; ws.title = "Прайс"
ws.append(["Прайс-лист (выдуманный)"]); ws.append([])
ws.append(["Артикул", "Наименование товара", "Ед.", "Цена, руб", "Норма расхода", "В упаковке"])
ws.append(["Сухие смеси"])
ws.append(["А1", "Штукатурка гипсовая 30 кг", "мешок", 590, 9, 30])
ws.append(["А2", "Наливной пол 20 кг", "мешок", 480, 16, 20])
ws.append(["Краски"])
ws.append(["Б1", "Краска интерьерная 10 л", "ведро", 3100, 0.3, 10])
ws2 = wb.create_sheet("Электрика")
ws2.append(["Наименование", "Ед. изм", "Стоимость"])
ws2.append(["Розетка двойная", "шт", 350])
ws2.append(["Кабель ВВГнг 3×2,5", "м", 95])
wb.save(out); print(out)
