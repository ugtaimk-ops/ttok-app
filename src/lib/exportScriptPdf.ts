import { Capacitor } from "@capacitor/core";
import { Directory, Filesystem } from "@capacitor/filesystem";
import { Share } from "@capacitor/share";
import fontkit from "@pdf-lib/fontkit";
import { PDFDocument, rgb, type PDFFont, type PDFPage } from "pdf-lib";
import fontUrl from "../assets/fonts/NanumGothic-Regular.ttf?url";

interface ScriptForPdf {
  title: string;
  outline: string[];
  tips: string[];
  script: string;
}

function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const lines: string[] = [];
  for (const paragraph of text.replace(/\r\n/g, "\n").split("\n")) {
    let line = "";
    for (const character of paragraph) {
      if (line && font.widthOfTextAtSize(line + character, size) > maxWidth) {
        lines.push(line);
        line = "";
      }
      line += character;
    }
    lines.push(line);
  }
  return lines;
}

function toBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return btoa(binary);
}

export async function exportScriptPdf({ title, outline, tips, script }: ScriptForPdf): Promise<void> {
  const pdfDoc = await PDFDocument.create();
  pdfDoc.registerFontkit(fontkit);
  const fontBytes = await fetch(fontUrl).then(response => {
    if (!response.ok) throw new Error("PDF 글꼴을 불러오지 못했어요.");
    return response.arrayBuffer();
  });
  const font = await pdfDoc.embedFont(fontBytes, { subset: true });
  const pageSize: [number, number] = [595.28, 841.89];
  const margin = 45;
  let page: PDFPage = pdfDoc.addPage(pageSize);
  let y = pageSize[1] - margin;
  const addPageIfNeeded = (lineHeight: number) => {
    if (y - lineHeight < margin) {
      page = pdfDoc.addPage(pageSize);
      y = pageSize[1] - margin;
    }
  };
  const draw = (value: string, size = 11, lineHeight = 19, heading = false) => {
    for (const line of wrapText(value, font, size, pageSize[0] - margin * 2)) {
      addPageIfNeeded(lineHeight);
      if (line) page.drawText(line, { x: margin, y, size, font, color: heading ? rgb(0.04, 0.31, 0.78) : rgb(0.12, 0.17, 0.25) });
      y -= lineHeight;
    }
  };
  draw(title || "발표 대본", 18, 27, true);
  y -= 12;
  if (outline.length) {
    draw("발표 구성", 13, 24, true);
    for (const item of outline) draw(`• ${item}`);
    y -= 10;
  }
  draw("발표 대본", 13, 24, true);
  draw(script || "내용 없음");
  if (tips.length) {
    y -= 10;
    draw("발표 팁", 13, 24, true);
    for (const item of tips) draw(`• ${item}`);
  }

  const bytes = await pdfDoc.save();
  const filename = `ttok-script-${Date.now()}.pdf`;
  if (Capacitor.isNativePlatform()) {
    await Filesystem.writeFile({ path: filename, directory: Directory.Cache, data: toBase64(bytes) });
    const { uri } = await Filesystem.getUri({ path: filename, directory: Directory.Cache });
    await Share.share({ title: title || "발표 대본", files: [uri], dialogTitle: "PDF 저장 또는 공유" });
  } else {
    const url = URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: "application/pdf" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 60_000);
  }
}
