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

# Смета-шаблон как у компании (выдуманные цифры): лист = помещение, колонка-отметка «1», повтор заголовков,
# подразделы, «Итого по разделу», «ИТОГО ПО ПОМЕЩЕНИЮ», «СКИДКА 0.1»; отдельный лист без скидки; скрытый лист-прайс.
wb = Workbook(); first = True
for room, rows, disc in [
    ("Кухня", [(1, "Демонтаж плинтуса", "м/п", 12, 100), (None, "Демонтаж паркета", "м2", 9, 200), (1, "Снятие обоев", "м2", 30, 150)], True),
    ("Спецмонтаж", [(1, "Натяжной потолок", "м2", 20, 400), (None, "Кондиционер", "шт", 1, 9000)], False)]:
    ws = wb.active if first else wb.create_sheet(room); ws.title = room; first = False
    ws.append(["Площадь пола"]); ws.append([9]); ws.append([None, None, "Адрес объекта: (выдуманный)"])
    ws.append([None, 1, "Демонтажные работы", "ед. изм.", "кол-во", "цена", "сумма", "цена", "сумма"])
    ws.append([None, 1, "Полы"])
    total = 0
    for f, n, u, q, p in rows:
        ws.append([None, f, n, u, q, p, q * p, p / 2, q * p / 2]); total += q * p if f == 1 else 0
    ws.append([None, 1, "Итого по разделу(демонтажные работы)", None, None, None, total])
    ws.append([None, 1, "ИТОГО ПО ПОМЕЩЕНИЮ. СТОИМОСТЬ РАБОТ", None, None, None, total])
    if disc:
        ws.append([None, None, "СКИДКА", None, None, None, 0.1]); ws.append([None, None, "ИТОГО ПО ПОМЕЩЕНИЮ С УЧЕТОМ СКИДКИ", None, None, None, total * 0.9])
    ws.append([None, None, "Составлено:", None, "Согласовано:"])
h = wb.create_sheet("Прайс для расчета"); h.sheet_state = "hidden"; h.append(["Наименование", "ед. изм.", "кол-во", "цена"]); h.append(["Работа из прайса", "м2", 1, 999])
out3 = os.path.join(os.path.dirname(out) or ".", "works_flag.xlsx"); wb.save(out3); print(out3)
