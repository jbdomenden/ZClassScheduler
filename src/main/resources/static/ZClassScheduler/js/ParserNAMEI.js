// NameiParser.js
/* =========================================================
   NameiParser.js
   - NAMEI Tertiary curriculum PDF parser
   - Currently shares the same parsing strategy as STI (column-flow + fallback).
   - Produces: { program, subjects: [{ code, name, yearTerm }] }
========================================================= */

(function (w) {
    function parse(text) {
        // If NAMEI has a different PDF layout later, replace this implementation.
        if (w.StiParser?.parse) return w.StiParser.parse(text);
        return { program: "", subjects: [] };
    }

    w.NameiParser = { parse };
})(window);