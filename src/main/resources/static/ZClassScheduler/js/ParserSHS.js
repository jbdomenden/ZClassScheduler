// ShsParser.js
/* =========================================================
   Senior High School curriculum PDF parser (Template-based)
   - Blocks:
       G11 Term 1 => yearTerm "1"
       G11 Term 2 => yearTerm "2"
       G12 Term 1 => yearTerm "3"
       G12 Term 2 => yearTerm "4"

   Matches the actual SHS template where:
   - Headers look like: "ABM-20-01 G11 Term 1"
   - Subject rows begin with a 6-digit Course ID and CORE/SPECIAL/APPLIED
   - Descriptions can wrap across lines BEFORE units appear (1.00)

   Output:
     { program, subjects: [{ code, name, yearTerm }] }
========================================================= */

(function (w) {
    function normalizeLines(text) {
        return String(text || "")
            .split(/\r?\n/)
            .map((l) => l.replace(/\s+/g, " ").trim())
            .filter(Boolean);
    }

    function mapGradeTermToYearTerm(grade, term) {
        const g = parseInt(grade, 10);
        const t = parseInt(term, 10);
        if (g === 11) return String(t);       // 1,2
        if (g === 12) return String(2 + t);   // 3,4
        return "1";
    }

    function detectHeaderYearTerm(line) {
        const l = String(line || "");

        // Template exact: "ABM-20-01 G11 Term 1"
        let m = l.match(/\bG(11|12)\s+Term\s+(1|2)\b/i);
        if (m) return mapGradeTermToYearTerm(m[1], m[2]);

        // Tolerant variants
        m = l.match(/\bGRADE\s*(11|12)\b.*\bTERM\s*(1|2)\b/i);
        if (m) return mapGradeTermToYearTerm(m[1], m[2]);

        return null;
    }

    function detectProgram(textLines) {
        // Best-effort:
        // - "ABM-Accountancy, Business Mgmt." => ABM
        // - "ABM-20-01" => ABM
        for (const l of textLines.slice(0, 80)) {
            let m = l.match(/^([A-Z]{2,10})\s*-\s*(Accountancy|Arts|Science|Humanities|STEM|ABM|TVL|GAS)/i);
            if (m) return m[1].toUpperCase();

            m = l.match(/\b([A-Z]{2,10})-\d{2}-\d{2}\b/);
            if (m) return m[1].toUpperCase();
        }
        return "SHS";
    }

    function isRowStart(line) {
        return /^\d{6}\b/.test(line);
    }

    function hasUnitsToken(line) {
        return /\b\d+\.\d{2}\b/.test(line); // 1.00 in template
    }

    function mergeWrappedRows(lines) {
        // Same strategy as JHS:
        // - Start when 6-digit ID appears
        // - Append until units token appears
        const merged = [];
        let buf = "";

        function flush() {
            if (buf) merged.push(buf.trim());
            buf = "";
        }

        for (const line of lines) {
            if (isRowStart(line)) {
                flush();
                buf = line;
                if (hasUnitsToken(buf)) flush();
            } else if (buf) {
                buf += " " + line;
                if (hasUnitsToken(buf)) flush();
            } else {
                merged.push(line);
            }
        }
        flush();

        return merged;
    }

    function parseRow(line) {
        // Expected shape (after merge):
        // 001259 CORE 1010 22 Oral Communication 1.00 Lecture
        const m = String(line || "").match(
            /^(\d{6})\s+(CORE|SPECIAL|APPLIED)\s+(\d{4})\s+(\d{1,3})\s+(.*)$/i
        );
        if (!m) return null;

        const subjectArea = m[2].toUpperCase();
        const catalogNo = m[3];
        let remainder = m[5] || "";

        // Cut description before units
        const unitPos = remainder.search(/\b\d+\.\d{2}\b/);
        if (unitPos >= 0) remainder = remainder.slice(0, unitPos).trim();

        const name = remainder.replace(/\s+/g, " ").trim();
        if (!name) return null;

        const code = `${subjectArea}${catalogNo}`.replace(/\s+/g, "").trim();
        return { code, name };
    }

    function parse(text) {
        const rawLines = normalizeLines(text);
        const lines = mergeWrappedRows(rawLines);

        const program = detectProgram(rawLines);
        let currentYT = "1";
        const subjects = [];

        for (const line of lines) {
            const yt = detectHeaderYearTerm(line);
            if (yt) {
                currentYT = yt;
                continue;
            }

            const row = parseRow(line);
            if (!row) continue;

            subjects.push({
                code: row.code,
                name: row.name,
                yearTerm: currentYT
            });


        return { program, subjects };
    }

    w.ShsParser = { parse };
})(window);