"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.escapeHtml = escapeHtml;
exports.unescapeHtml = unescapeHtml;
exports.escapeHtmlPreview = escapeHtmlPreview;
function escapeHtml(text) {
    const htmlEscapes = {
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#x27;',
        '/': '&#x2F;',
    };
    return text.replace(/[&<>"'/]/g, (char) => htmlEscapes[char]);
}
function unescapeHtml(text) {
    const htmlUnescapes = {
        '&amp;': '&',
        '&lt;': '<',
        '&gt;': '>',
        '&quot;': '"',
        '&#x27;': "'",
        '&#x2F;': '/',
    };
    return text.replace(/&amp;|&lt;|&gt;|&quot;|&#x27;|&#x2F;/g, (entity) => htmlUnescapes[entity] || entity);
}
function escapeHtmlPreview(text, maxLength = 100) {
    const escaped = escapeHtml(text);
    if (escaped.length <= maxLength)
        return escaped;
    return escaped.substring(0, maxLength) + '...';
}
