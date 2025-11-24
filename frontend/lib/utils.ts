import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

// PDF extraction utility
export async function extractPdfText(file: File): Promise<string> {
  try {
    // Dynamically import pdfjs-dist to avoid SSR issues
    const pdfjsLib = await import("pdfjs-dist")
    
    // Set worker source for browser environment
    if (typeof window !== "undefined") {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`
    }

    const arrayBuffer = await file.arrayBuffer()
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer })
    const pdf = await loadingTask.promise

    let text = ""
    const maxPages = Math.min(pdf.numPages, 10) // Limit to first 10 pages

    for (let i = 1; i <= maxPages; i++) {
      const page = await pdf.getPage(i)
      const textContent = await page.getTextContent()
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ")
      text += pageText + "\n"

      // Stop if we've reached the size limit
      if (text.length > 15000) {
        text = text.slice(0, 15000)
        break
      }
    }

    return text.trim()
  } catch (error) {
    console.error("Error extracting PDF text:", error)
    throw new Error("Failed to extract text from PDF. Please ensure the file is a valid PDF.")
  }
}

// Text file extraction utility
export async function extractTextFile(file: File): Promise<string> {
  try {
    const text = await file.text()
    // Limit to 15k characters
    return text.slice(0, 15000).trim()
  } catch (error) {
    console.error("Error reading text file:", error)
    throw new Error("Failed to read text file.")
  }
}
