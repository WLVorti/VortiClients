/* РЕНДЕР MARKDOWN ДЛЯ НОВОСТЕЙ.
 *
 * Пишет субадмин, читают все — поэтому текст новости нельзя вставлять в
 * страницу как есть. Здесь нет внешней библиотеки и не будет: сначала весь
 * текст экранируется, и только потом из ЭСКЕЙПЕННОЙ строки собираются теги.
 * Порядок именно такой, и менять его нельзя: если хоть раз отрендерить
 * неэкранированный текст, опечатка в разметке станет исполняемым кодом у
 * каждого, кто открыл новость.
 *
 * Поддерживается markdown в духе Obsidian:
 *   ## заголовки, **жирный**, *курсив*, ~~зачёркнутый~~, ==выделение==,
 *   `код`, ```блок кода```, цитаты >, списки - и 1., задачи - [ ] / - [x],
 *   таблицы | a | b |, разделитель ---, ссылки [текст](адрес), картинки
 *   ![подпись](адрес), переносы строк как в обсидиане: одна новая строка
 *   внутри абзаца = <br>.
 *
 * Адреса ссылок и картинок проверяются: пропускаются только http, https,
 * mailto и пути от корня сайта. Всё остальное (javascript:, data:, vbscript:)
 * превращается в обычный текст. Без этой проверки одна ссылка в новости
 * выполнила бы код от имени сайта.
 *
 * Обёртка: window.Markdown = { render(md) }.
 */
window.Markdown = (function () {
  'use strict';

  /** Экранирование всего, что может стать разметкой или атрибутом. */
  function esc(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  /**
   * Пропустить ли адрес. Разрешено ровно четыре схемы плюс путь от корня —
   * этого хватает и для внешних ссылок, и для картинок из /uploads/news.
   * Всё остальное (javascript:, data:, vbscript:, файловые пути) отбрасывается:
   * адрес приходит из поля ввода субадмина, но попадает в src/href у всех.
   */
  function safeUrl(raw) {
    const url = String(raw || '').trim();
    if (!url) return '';
    // Протокол-относительная ссылка: //example.com — это внешний адрес
    if (url.startsWith('//')) return '';
    if (url.startsWith('/')) return url;
    if (/^https?:\/\//i.test(url)) return url;
    if (/^mailto:/i.test(url)) return url;
    return '';
  }

  /* ---------------------------------------------------------------- инлайн */

  // Хранилище для кусков, которые нельзя трогать дальнейшими заменами:
  // блоков кода, экранированных ссылок. Плейсхолдер состоит только из
  // непечатного символа и цифр, поэтому в пользовательском тексте он не
  // встречается и не может быть подделан.
  var stash = [];
  function keep(html) {
    stash.push(html);
    return '\u0000' + (stash.length - 1) + '\u0000';
  }

  function restore(text) {
    return text.replace(/\u0000(\d+)\u0000/g, function (_, index) {
      return stash[Number(index)] != null ? stash[Number(index)] : '';
    });
  }

  /** `код` — раньше всего остального: внутри кода маркеры не работают. */
  function inlineCode(text) {
    return text.replace(/`([^`\n]+)`/g, function (_, code) {
      return keep('<code>' + code + '</code>');
    });
  }

  /** ![подпись](адрес) — адрес проверяется, невалидный остаётся текстом. */
  function inlineImages(text) {
    return text.replace(/!\[([^\]]*)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (whole, alt, rawUrl) {
      var url = safeUrl(rawUrl);
      if (!url) return whole;
      return keep('<img src="' + esc(url) + '" alt="' + esc(alt) + '" loading="lazy" decoding="async">');
    });
  }

  /** [текст](адрес) — внешние ссылки открываем в новой вкладке и безопасно
   *  от javascript:, иначе по клику выполнился бы чужой код. */
  function inlineLinks(text) {
    return text.replace(/\[([^\]]+)\]\(([^)\s]+)(?:\s+"[^"]*")?\)/g, function (whole, label, rawUrl) {
      var url = safeUrl(rawUrl);
      if (!url) return whole;
      var external = /^https?:/i.test(url);
      var attrs = external ? ' target="_blank" rel="noopener noreferrer"' : '';
      return keep('<a href="' + esc(url) + '"' + attrs + '>' + label + '</a>');
    });
  }

  /** Обсидиановское ==выделение==. */
  function inlineHighlight(text) {
    return text.replace(/==([^=\n]+)==/g, '<mark>$1</mark>');
  }

  function inlineBold(text) {
    return text.replace(/\*\*([^\n]+?)\*\*/g, '<strong>$1</strong>');
  }

  function inlineItalic(text) {
    // Курсив и только курсив: одна звёздочка с каждой стороны, но не внутри
    // уже готового <strong>, который сюда не попадает — он в stash.
    return text.replace(/(^|[^*])\*([^*\n]+)\*/g, '$1<em>$2</em>');
  }

  function inlineStrike(text) {
    return text.replace(/~~([^~\n]+)~~/g, '<del>$1</del>');
  }

  /** Одна новая строка внутри абзаца = перенос, как в обсидиане.
   *  Делается последним, уже по собранному innerHTML: иначе перенос съел бы
   *  разметку, посчитанную как один абзац. */
  function inlineBreaks(text) {
    return text.replace(/ {2,}\n/g, '<br>\n').replace(/\n/g, '<br>\n');
  }

  function renderInline(raw) {
    stash = [];
    var text = esc(String(raw == null ? '' : raw));
    text = inlineCode(text);
    text = inlineImages(text);
    text = inlineLinks(text);
    text = inlineHighlight(text);
    text = inlineBold(text);
    text = inlineStrike(text);
    text = inlineItalic(text);
    return restore(text);
  }

  /* ---------------------------------------------------------------- блоки */

  var RE_HEADING = /^(#{1,6})\s+(.*)$/;
  var RE_HR = /^\s*([-*_])\s*(\1\s*){2,}$/;
  var RE_UL = /^(\s*)([-*+])\s+(.*)$/;
  var RE_OL = /^(\s*)(\d+)[.)]\s+(.*)$/;
  var RE_TASK = /^\[( |x|X)\]\s+(.*)$/;
  var RE_QUOTE = /^\s*>\s?(.*)$/;
  var RE_TABLE_SEP = /^\s*\|?[\s:|-]+\|[\s:|-]*$/;
  var RE_ADMON = /^\[!(success|info|tip|important|abstract|warning|danger|note)\]\s*$/i;

  /** Глубина вложенности списка: два отступа = один уровень. */
  function indentOf(spaces) {
    return Math.min(Math.floor(spaces / 2), 6);
  }

  function checkboxHtml(checked) {
    return (
      '<input class="md-check" type="checkbox" disabled' +
      (checked ? ' checked' : '') +
      ' aria-label="готово">'
    );
  }

  /** Строка списка → готовый innerHTML. Галочка «- [x]» распознаётся здесь и
   *  становится настоящим disabled-чекбоксом, а не картинкой. */
  function itemHtml(text) {
    var task = RE_TASK.exec(text);
    if (!task) return renderInline(text);
    return checkboxHtml(task[1].toLowerCase() === 'x') + renderInline(task[2]);
  }

  /**
   * Списки. Небольшой конечный автомат вместо готовой библиотеки: вложенность
   * считается по отступу, тип списка (маркированный/нумерованный) переключается
   * на ходу. Смешанные списки в новостях редки, но переключение мы всё-таки
   * делаем — иначе «- пункт» после «1. пункт» закрыл бы предыдущий <ol>.
   *
   * Принимает копию строк и возвращает НИЧЕГО: вызывающий сам отсчитывает,
   * сколько строк съедено, — иначе пришлось бы возвращать и HTML, и индекс,
   * и пустой массив потраченных строк в трёх значениях сразу.
   */
  function renderLists(lines) {
    var out = [];
    var stack = [];

    function closeTo(depth) {
      while (stack.length && stack[stack.length - 1].depth >= depth) {
        var list = stack.pop();
        out.push('</li></' + list.tag + '>');
      }
    }

    function openList(depth, tag) {
      var top = stack[stack.length - 1];
      if (top && top.depth === depth && top.tag === tag) return;
      // Закрываем всё, что вложено глубже, и список другого типа на той же
      // глубине. Список того же типа на той же глубине НЕ закрываем: иначе
      // «- пункт один /   - вложенный / - пункт два» распался бы на три
      // отдельных <ul> вместо одного с вложенным.
      while (stack.length) {
        var inner = stack[stack.length - 1];
        if (inner.depth < depth) break;
        if (inner.depth === depth && inner.tag === tag) break;
        out.push('</li></' + inner.tag + '>');
        stack.pop();
      }
      var current = stack[stack.length - 1];
      if (current && current.depth === depth && current.tag === tag) return;
      out.push('<' + tag + '>');
      stack.push({ depth: depth, tag: tag, first: true });
    }

    function addItem(inner) {
      var top = stack[stack.length - 1];
      if (!top) return;
      if (top.first) top.first = false;
      else out.push('</li>');
      out.push('<li>' + inner);
    }

    var consumed = 0;

    while (consumed < lines.length) {
      var line = lines[consumed];
      var ul = RE_UL.exec(line);
      var ol = RE_OL.exec(line);

      if (ul) {
        openList(indentOf(ul[1].length), 'ul');
        addItem(itemHtml(ul[3]));
        consumed += 1;
        continue;
      }

      if (ol) {
        openList(indentOf(ol[1].length), 'ol');
        addItem(itemHtml(ol[3]));
        consumed += 1;
        continue;
      }

      if (!line.trim()) {
        // Пустая строка закрывает список, только если дальше снова не список.
        var next = lines[consumed + 1];
        if (next && (RE_UL.test(next) || RE_OL.test(next))) {
          consumed += 1;
          continue;
        }
        closeTo(0);
        break;
      }

      if (stack.length) {
        // Продолжение пункта: обычный текст с отступом внутри списка.
        addItem(itemHtml(line.trim()));
        consumed += 1;
        continue;
      }

      break;
    }

    closeTo(0);
    return { html: out.join(''), consumed: consumed };
  }

  /* ---------------------------------------------------------------- таблицы */

  /**
   * Таблица: строка `| a | b |`, под ней разделитель `| --- | :-: |`,
   * дальше строки. Выравнивание берём из разделителя — иначе автору нечем
   * сказать «здесь по центру».
   */
  function isTableRow(line) {
    return /^\s*\|.*\|\s*$/.test(line) && line.indexOf('|') !== line.lastIndexOf('|');
  }

  function tableCells(line) {
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(function (cell) {
      return cell.trim();
    });
  }

  function alignments(sepLine) {
    return tableCells(sepLine).map(function (cell) {
      var left = cell.charAt(0) === ':';
      var right = cell.charAt(cell.length - 1) === ':';
      if (left && right) return 'center';
      if (right) return 'right';
      if (left) return 'left';
      return '';
    });
  }

  function renderTable(rows, align, out) {
    var head = rows.shift();
    out.push('<div class="md-table-wrap"><table class="md-table"><thead><tr>');
    head.forEach(function (cell, i) {
      var alignAttr = align[i] ? ' style="text-align:' + align[i] + '"' : '';
      out.push('<th' + alignAttr + '>' + renderInline(cell) + '</th>');
    });
    out.push('</tr></thead><tbody>');
    rows.forEach(function (row) {
      out.push('<tr>');
      head.forEach(function (_, i) {
        var cell = row[i] == null ? '' : row[i];
        var alignAttr = align[i] ? ' style="text-align:' + align[i] + '"' : '';
        out.push('<td' + alignAttr + '>' + renderInline(cell) + '</td>');
      });
      out.push('</tr>');
    });
    out.push('</tbody></table></div>');
  }

  /* ---------------------------------------------------------------- основное */

  /**
   * Markdown → HTML.
   *
   * @param {string} md исходный текст
   * @param {{ mediaByUrl?: Object }} [opts] необязательная карта вложений
   *        новости: по адресу подставляется подпись вложения
   * @returns {string} готовый HTML, безопасный для innerHTML
   */
  function render(md, opts) {
    opts = opts || {};
    var mediaByUrl = opts.mediaByUrl || null;

    var source = String(md == null ? '' : md).replace(/\r\n?/g, '\n');
    var lines = source.split('\n');
    var out = [];
    var i = 0;

    while (i < lines.length) {
      var line = lines[i];

      if (!line.trim()) {
        i += 1;
        continue;
      }

      var admon = RE_ADMON.exec(line);
      if (admon) {
        i += 1;
        var type = admon[1].toLowerCase();
        var content = [];
        while (i < lines.length && lines[i].trim()) {
          content.push(lines[i]);
          i += 1;
        }
        if (i < lines.length && !lines[i].trim()) i += 1;
        var cls = 'md-callout md-callout--' + type;
        var inner = renderBlockLines(content, mediaByUrl);
        var innerHtml = Array.isArray(inner) ? inner.join('') : String(inner || '');
        out.push('<div class="' + cls + '">' + innerHtml + '</div>');
        continue;
      }
      var fence = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/.exec(line);
      if (fence) {
        var marker = fence[1].charAt(0);
        var len = fence[1].length;
        var body = [];
        i += 1;
        while (i < lines.length) {
          var closer = new RegExp('^\\s*' + (marker === '`' ? '`' : '~') + '{' + len + ',}\\s*$');
          if (closer.test(lines[i])) {
            i += 1;
            break;
          }
          body.push(lines[i]);
          i += 1;
        }
        var lang = fence[2] ? ' class="language-' + esc(fence[2]) + '"' : '';
        out.push('<pre class="md-pre"><code' + lang + '>' + esc(body.join('\n')) + '</code></pre>');
        continue;
      }

      var heading = RE_HEADING.exec(line);
      if (heading) {
        var level = heading[1].length;
        out.push('<h' + level + ' class="md-h">' + renderInline(heading[2].replace(/\s+#+\s*$/, '')) + '</h' + level + '>');
        i += 1;
        continue;
      }

      if (RE_HR.test(line)) {
        out.push('<hr class="md-hr">');
        i += 1;
        continue;
      }

      // Цитата: подряд идущие строки > склеиваются в один блок, внутренние
      // пустые строки сохраняются переносом.
      if (RE_QUOTE.test(line)) {
        var quoted = [];
        while (i < lines.length && (RE_QUOTE.test(lines[i]) || (lines[i].trim() && quoted.length))) {
          var q = RE_QUOTE.exec(lines[i]);
          quoted.push(q ? q[1] : lines[i].trim());
          i += 1;
        }

        // Формат GitHub '> [!NOTE]' + текст. Маркер нужно снять здесь, иначе
        // читатель опубликованной новости увидит буквальное «[!NOTE]».
        var qAdmon = quoted.length ? RE_ADMON.exec(String(quoted[0]).trim()) : null;
        if (qAdmon) {
          var qType = qAdmon[1].toLowerCase();
          var qBody = quoted.slice(1);
          out.push(
            '<div class="md-callout md-callout--' + qType + '">' +
            renderBlockLines(qBody, mediaByUrl) +
            '</div>'
          );
          continue;
        }

        out.push('<blockquote class="md-quote">' + renderInline(quoted.join('\n')) + '</blockquote>');
        continue;
      }

      // Таблица: строка с путями + разделитель + хотя бы одна строка данных.
      if (
        isTableRow(line) &&
        RE_TABLE_SEP.test(lines[i + 1] || '') &&
        isTableRow(lines[i + 2] || '')
      ) {
        var rows = [tableCells(line)];
        var align = alignments(lines[i + 1]);
        i += 2;
        while (i < lines.length && isTableRow(lines[i])) {
          rows.push(tableCells(lines[i]));
          i += 1;
        }
        renderTable(rows, align, out);
        continue;
      }

      if (RE_UL.test(line) || RE_OL.test(line)) {
        // Съеденные строки известны только после разбора — сдвигаемся на них,
        // а не на всю оставшуюся часть: дальше может идти абзац.
        var list = renderLists(lines.slice(i));
        out.push(list.html);
        i += Math.max(list.consumed, 1);
        continue;
      }

      // Абзац: жмём пустые строки, переносы сохраняем.
      var para = [];
      while (i < lines.length && lines[i].trim() && !RE_UL.test(lines[i]) && !RE_OL.test(lines[i])) {
        var peek = RE_HEADING.exec(lines[i]);
        if (peek) break;
        if (RE_QUOTE.test(lines[i]) || RE_HR.test(lines[i]) || isTableRow(lines[i])) break;
        if (/^\s*(`{3,}|~{3,})/.test(lines[i])) break;
        para.push(lines[i]);
        i += 1;
      }
      if (para.length) out.push('<p class="md-p">' + inlineBreaks(renderInline(para.join('\n'))) + '</p>');
    }

    var html = out.join('');

    // Подписи вложений: ![](url) без alt подставляет имя файла из вложения,
    // чтобы в ленте картинка была подписана тем, что субадмин приложил.
    if (mediaByUrl) {
      html = html.replace(/<img src="([^"]+)" alt=""([^>]*)>/g, function (whole, url, rest) {
        var media = mediaByUrl[url];
        if (!media || !media.name) return whole;
        return (
          '<figure class="md-figure">' + whole + '<figcaption>' + esc(media.name) + '</figcaption></figure>'
        );
      });
    }

    return html;
  }

  /** Рендер блоков для подмассива строк (вложенные блоки: содержимое callout). */
  function renderBlockLines(blockLines, mediaByUrl) {
    var out = [];
    var i = 0;
    var lines = blockLines || [];
    mediaByUrl = mediaByUrl || null;

    while (i < lines.length) {
      var line = lines[i];

      if (!line.trim()) {
        i += 1;
        continue;
      }

      var admon = RE_ADMON.exec(line);
      if (admon) {
        i += 1;
        var type = admon[1].toLowerCase();
        var content = [];
        while (i < lines.length && lines[i].trim()) {
          content.push(lines[i]);
          i += 1;
        }
        if (i < lines.length && !lines[i].trim()) i += 1;
        var cls = 'md-callout md-callout--' + type;
        out.push('<div class="' + cls + '">' + renderBlockLines(content, mediaByUrl) + '</div>');
        continue;
      }

      var fence = /^\s*(`{3,}|~{3,})\s*([A-Za-z0-9_+-]*)\s*$/.exec(line);
      if (fence) {
        var marker = fence[1].charAt(0);
        var len = fence[1].length;
        var body = [];
        i += 1;
        while (i < lines.length) {
          var closer = new RegExp('^\\s*' + (marker === '`' ? '`' : '~') + '{' + len + ',}\\s*$');
          if (closer.test(lines[i])) {
            i += 1;
            break;
          }
          body.push(lines[i]);
          i += 1;
        }
        var lang = fence[2] ? ' class="language-' + esc(fence[2]) + '"' : '';
        out.push('<pre class="md-pre"><code' + lang + '>' + esc(body.join('\n')) + '</code></pre>');
        continue;
      }

      var heading = RE_HEADING.exec(line);
      if (heading) {
        var level = heading[1].length;
        out.push('<h' + level + ' class="md-h">' + renderInline(heading[2].replace(/\s+#+\s*$/, '')) + '</h' + level + '>');
        i += 1;
        continue;
      }

      if (RE_HR.test(line)) {
        out.push('<hr class="md-hr">');
        i += 1;
        continue;
      }

      var quote = RE_QUOTE.exec(line);
      if (quote) {
        var qlines = [];
        while (i < lines.length && RE_QUOTE.test(lines[i])) {
          qlines.push(RE_QUOTE.exec(lines[i])[1]);
          i += 1;
        }

        // Формат GitHub: '> [!NOTE]' + текст. Если не разобрать маркер здесь,
        // читатель увидит в опубликованной новости буквальное «[!NOTE]».
        var qAdmon = qlines.length ? RE_ADMON.exec(qlines[0].trim()) : null;
        if (qAdmon) {
          var qType = qAdmon[1].toLowerCase();
          var qBody = qlines.slice(1);
          out.push(
            '<div class="md-callout md-callout--' + qType + '">' +
            (qBody.length ? renderBlockLines(qBody, mediaByUrl) : '') +
            '</div>'
          );
          continue;
        }

        out.push('<blockquote class="md-quote">' + inlineBreaks(renderInline(qlines.join('\n'))) + '</blockquote>');
        continue;
      }

      if (isTableRow(line)) {
        var tableLines = [];
        while (i < lines.length && isTableRow(lines[i])) {
          tableLines.push(lines[i]);
          i += 1;
        }
        if (tableLines.length >= 2 && RE_TABLE_SEP.test(tableLines[1])) {
          var sepAlign = tableLines.splice(1, 1)[0];
          renderTable(tableLines.map(tableCells), alignments(sepAlign), out);
        } else {
          var cells = tableCells(tableLines[0] || '');
          out.push('<div class="md-table-wrap"><table class="md-table"><tbody><tr>');
          cells.forEach(function (c) {
            out.push('<td>' + renderInline(c) + '</td>');
          });
          out.push('</tr></tbody></table></div>');
        }
        continue;
      }

      if (RE_UL.test(line) || RE_OL.test(line)) {
        var list = renderLists(lines.slice(i));
        out.push(list.html);
        i += Math.max(list.consumed, 1);
        continue;
      }

      var para = [];
      while (i < lines.length && lines[i].trim() && !RE_UL.test(lines[i]) && !RE_OL.test(lines[i])) {
        var peek = RE_HEADING.exec(lines[i]);
        if (peek) break;
        if (RE_QUOTE.test(lines[i]) || RE_HR.test(lines[i]) || isTableRow(lines[i])) break;
        if (/^\s*(`{3,}|~{3,})/.test(lines[i])) break;
        para.push(lines[i]);
        i += 1;
      }
      if (para.length) out.push('<p class="md-p">' + inlineBreaks(renderInline(para.join('\n'))) + '</p>');
    }

    var htmlRes = out.join('');
    if (mediaByUrl) {
      htmlRes = htmlRes.replace(/<img src="([^"]+)" alt=""([^>]*)>/g, function (whole, url, rest) {
        var media = mediaByUrl[url];
        if (!media || !media.name) return whole;
        return (
          '<figure class="md-figure">' + whole + '<figcaption>' + esc(media.name) + '</figcaption></figure>'
        );
      });
    }
    return htmlRes;
  }

  /** Только текст без разметки — для предпросмотра и подписи в списках. */
  function toText(md, limit) {
    var text = String(md == null ? '' : md)
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, ' ')
      .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
      .replace(/[*_~`=#>|-]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    if (limit && text.length > limit) return text.slice(0, limit - 1).trimEnd() + '…';
    return text;
  }

  return { render: render, toText: toText, escapeHtml: esc, safeUrl: safeUrl };
})();