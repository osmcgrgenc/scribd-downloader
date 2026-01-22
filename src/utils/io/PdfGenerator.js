import { promises as fs } from 'fs'
import { PDFDocument } from 'pdf-lib'
import path from 'path'

class PdfGenerator {
    constructor() {
        if (!PdfGenerator.instance) {
            PdfGenerator.instance = this
        }
        return PdfGenerator.instance
    }

    /**
     * Generate PDF from images
     * @param {import('../../object/Image.js').Image[]} images 
     * @param {string} outputPath 
     * @param {object} [reporter] 
     */
    async generate(images, outputPath, reporter) {
        if (!images || images.length === 0) {
            throw new Error("No images provided for PDF generation")
        }

        const pdfDoc = await PDFDocument.create()

        for (const img of images) {
            let imageBytes
            try {
                imageBytes = await fs.readFile(img.path)
            } catch (err) {
                throw new Error(`Failed to read image ${img.path}: ${err.message}`)
            }

            const ext = path.extname(img.path).toLowerCase()
            let embedImage

            if (ext === '.jpg' || ext === '.jpeg') {
                embedImage = await pdfDoc.embedJpg(imageBytes)
            } else if (ext === '.png') {
                embedImage = await pdfDoc.embedPng(imageBytes)
            } else {
                throw new Error(`Unsupported image format: ${ext}`)
            }

            const page = pdfDoc.addPage([img.width, img.height])
            page.drawImage(embedImage, {
                x: 0,
                y: 0,
                width: img.width,
                height: img.height,
            })
        }

        try {
            const pdfBytes = await pdfDoc.save()
            await fs.writeFile(outputPath, pdfBytes)
            if (reporter && typeof reporter.log === 'function') {
                reporter.log(`Generated PDF: ${outputPath}`)
            }
        } catch (err) {
            throw new Error(`Failed to save PDF to ${outputPath}: ${err.message}`)
        }
    }

    /**
     * Merge multiple PDFs into one
     * @param {string[]} inputPdfPaths 
     * @param {string} outputPath 
     */
    async merge(inputPdfPaths, outputPath) {
        if (!inputPdfPaths || inputPdfPaths.length === 0) {
            throw new Error("No input PDFs provided for merge")
        }

        const merged = await PDFDocument.create()

        for (const pdfPath of inputPdfPaths) {
            try {
                const pdfBytes = await fs.readFile(pdfPath)
                const pdfDoc = await PDFDocument.load(pdfBytes)
                const copiedPages = await merged.copyPages(pdfDoc, pdfDoc.getPageIndices())
                copiedPages.forEach(page => merged.addPage(page))
            } catch (err) {
                throw new Error(`Failed to merge PDF ${pdfPath}: ${err.message}`)
            }
        }

        try {
            const mergedBytes = await merged.save()
            await fs.writeFile(outputPath, mergedBytes)
        } catch (err) {
            throw new Error(`Failed to save merged PDF to ${outputPath}: ${err.message}`)
        }
    }
}

export const pdfGenerator = new PdfGenerator()
