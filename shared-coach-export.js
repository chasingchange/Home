(function () {
  const BRAND = {
    title: "Chasing Change",
    footer: "© 2026 Chasing Change — 1% better every day.",
    colors: {
      bg: "#f5f5f7",
      text: "#071f35",
      accent: "#77d770",
      muted: "#5d6c79",
    },
    fonts: {
      title: "Museo Moderno",
      heading: "Raleway",
      body: "Muli",
    },
    coachEmail: "tywadebusiness@gmail.com",
  };

  function todayStamp() {
    return new Date().toISOString().slice(0, 10);
  }

  function slugify(value) {
    return String(value || "tool")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "") || "tool";
  }

  function buildFileName(toolSlug) {
    return `${slugify(toolSlug)}-${todayStamp()}.pdf`;
  }

  function openCoachMailDraft(toolName) {
    const subject = `Chasing Change Tool Submission — ${toolName}`;
    const body = [
      "Hi Tyler,",
      "",
      `I’m sending over my result from the ${toolName} tool.`,
      "",
      "Please see the attached PDF.",
      "",
      "Name:",
      "Email:",
      "Notes:",
    ].join("\n");

    const mailto = `mailto:${BRAND.coachEmail}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
    window.location.href = mailto;
  }

  // Future direct-send hook. Replace this function later with EmailJS/Resend/SendGrid.
  async function sendCoachEmail(payload) {
    openCoachMailDraft(payload.toolName);
    return { ok: true, mode: "mailto" };
  }

  function getPdfLib() {
    return window.jspdf && window.jspdf.jsPDF;
  }

  function ensurePdfLib() {
    const jsPDF = getPdfLib();
    if (!jsPDF) throw new Error("PDF engine unavailable. Load jsPDF before using coach export.");
    return jsPDF;
  }

  function normalizePayload(config, extracted) {
    return {
      toolName: extracted.toolName || config.toolName || "Tool",
      toolSlug: extracted.toolSlug || config.toolSlug || slugify(extracted.toolName || config.toolName || "tool"),
      sections: Array.isArray(extracted.sections) ? extracted.sections : [],
      notes: extracted.notes || "",
      generatedAt: new Date(),
    };
  }

  function drawWrappedText(doc, text, x, y, maxWidth, lineHeight) {
    const lines = doc.splitTextToSize(String(text || ""), maxWidth);
    doc.text(lines, x, y);
    return y + lines.length * lineHeight;
  }

  function generateBrandedPdf(payload) {
    const jsPDF = ensurePdfLib();
    const doc = new jsPDF({ unit: "pt", format: "letter" });
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const margin = 42;
    const contentWidth = pageWidth - margin * 2;
    const lineHeight = 15;
    let y = margin;

    const addPageIfNeeded = (reserve = 0) => {
      if (y + reserve > pageHeight - margin - 24) {
        doc.addPage();
        y = margin;
      }
    };

    const drawHeader = () => {
      doc.setFillColor(245, 245, 247);
      doc.rect(0, 0, pageWidth, pageHeight, "F");
      doc.setDrawColor(119, 215, 112);
      doc.setLineWidth(2);
      doc.line(margin, y, pageWidth - margin, y);
      y += 12;

      doc.setFont("helvetica", "bold");
      doc.setTextColor(7, 31, 53);
      doc.setFontSize(22);
      doc.text(BRAND.title, margin, y + 10);
      y += 24;

      doc.setFontSize(14);
      doc.text(payload.toolName, margin, y);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(93, 108, 121);
      doc.text(`Generated: ${todayStamp()}`, margin, y + 14);
      y += 30;
    };

    const drawFooter = () => {
      const totalPages = doc.getNumberOfPages();
      for (let page = 1; page <= totalPages; page += 1) {
        doc.setPage(page);
        doc.setDrawColor(220, 225, 229);
        doc.line(margin, pageHeight - margin, pageWidth - margin, pageHeight - margin);
        doc.setFont("helvetica", "normal");
        doc.setFontSize(9);
        doc.setTextColor(93, 108, 121);
        doc.text(BRAND.footer, margin, pageHeight - margin + 14);
        doc.text(`Page ${page} of ${totalPages}`, pageWidth - margin - 62, pageHeight - margin + 14);
      }
    };

    drawHeader();

    payload.sections.forEach((section) => {
      addPageIfNeeded(46);
      doc.setFont("helvetica", "bold");
      doc.setFontSize(12);
      doc.setTextColor(7, 31, 53);
      doc.text(section.title || "Section", margin, y);
      y += 12;

      doc.setDrawColor(119, 215, 112);
      doc.setLineWidth(1);
      doc.line(margin, y, margin + contentWidth, y);
      y += 12;

      doc.setFont("helvetica", "normal");
      doc.setFontSize(10);
      doc.setTextColor(7, 31, 53);

      (section.fields || []).forEach((field) => {
        addPageIfNeeded(30);
        const label = `${field.label || "Field"}:`;
        doc.setFont("helvetica", "bold");
        doc.text(label, margin, y);
        doc.setFont("helvetica", "normal");
        y = drawWrappedText(doc, field.value || "—", margin + 120, y, contentWidth - 120, lineHeight);
        y += 3;
      });

      (section.paragraphs || []).forEach((paragraph) => {
        addPageIfNeeded(32);
        y = drawWrappedText(doc, paragraph, margin, y, contentWidth, lineHeight);
        y += 6;
      });

      y += 4;
    });

    drawFooter();
    return doc;
  }

  async function runExport(config, mode) {
    const extracted = await config.extract();
    const payload = normalizePayload(config, extracted || {});
    const fileName = buildFileName(payload.toolSlug);
    const pdf = generateBrandedPdf(payload);
    pdf.save(fileName);

    if (mode === "email") {
      await sendCoachEmail(payload);
    }

    if (config.messageTarget) {
      const target = typeof config.messageTarget === "string" ? document.querySelector(config.messageTarget) : config.messageTarget;
      if (target) {
        target.textContent = "Your PDF has been downloaded. Attach it to the email draft that just opened.";
      }
    }
  }

  function registerTool(config) {
    const container = typeof config.buttonTarget === "string"
      ? document.querySelector(config.buttonTarget)
      : config.buttonTarget;
    if (!container) return null;

    const wrap = document.createElement("div");
    wrap.className = "cc-coach-export-actions";
    wrap.style.display = "flex";
    wrap.style.flexWrap = "wrap";
    wrap.style.gap = "8px";
    wrap.style.marginTop = "12px";

    const emailBtn = document.createElement("button");
    emailBtn.type = "button";
    emailBtn.textContent = "Email This to Your Coach";
    emailBtn.className = config.emailButtonClass || "btn btn-p";

    const downloadBtn = document.createElement("button");
    downloadBtn.type = "button";
    downloadBtn.textContent = "Download PDF";
    downloadBtn.className = config.downloadButtonClass || "btn";

    wrap.appendChild(emailBtn);
    if (config.includeDownloadButton !== false) {
      wrap.appendChild(downloadBtn);
    }

    const messageEl = document.createElement("p");
    messageEl.className = "cc-coach-export-msg";
    messageEl.style.marginTop = "8px";
    messageEl.style.fontSize = "0.85rem";
    messageEl.style.color = BRAND.colors.muted;

    container.appendChild(wrap);
    container.appendChild(messageEl);

    const runtimeConfig = { ...config, messageTarget: messageEl };

    emailBtn.addEventListener("click", async () => {
      await runExport(runtimeConfig, "email");
    });

    downloadBtn.addEventListener("click", async () => {
      await runExport(runtimeConfig, "download");
      messageEl.textContent = "Your PDF has been downloaded.";
    });

    return { emailBtn, downloadBtn, messageEl };
  }

  window.CCCoachExport = {
    registerTool,
    sendCoachEmail,
    openCoachMailDraft,
    generateBrandedPdf,
  };
})();
