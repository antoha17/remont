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

# Смета работ в Excel (выдуманная): шапка, разделы, итоги
import os
wb = Workbook(); ws = wb.active; ws.title = "Смета"
ws.append(["Смета на ремонт (выдуманная)"]); ws.append([])
ws.append(["№", "Наименование работ", "Ед. изм.", "Кол-во", "Цена, руб", "Сумма, руб"])
ws.append(["", "Полы"])
ws.append([1, "Укладка ламината", "м2", 20, 450, 9000])
ws.append([2, "Монтаж плинтуса", "м.п.", 18, 150, 2700])
ws.append(["", "Итого по разделу", "", "", "", 11700])
ws.append(["", "Стены"])
ws.append([3, "Поклейка обоев", "м2", 40, 290, 11600])
ws.append(["", "Итого по смете", "", "", "", 23300])
out2 = os.path.join(os.path.dirname(out) or ".", "works.xlsx"); wb.save(out2); print(out2)
