import Foundation
import ImageIO
import UIKit
import Vision

/// Best-effort extraction of vendor / amount / date / payment details from a scanned receipt image.
///
/// Heuristics — designed for noisy paper-receipt OCR, not high-fidelity invoices:
/// - **Amount**: prefer the largest currency-formatted number on a line that contains
///   "TOTAL", "BALANCE DUE", or "AMOUNT". Fall back to the largest currency number anywhere.
/// - **Vendor**: first non-junk line near the top (junk = pure number, date, address-y,
///   short single word). Use the recognized text's own confidence.
/// - **Date**: NSDataDetector with `.date` type — handles every common receipt format.
///
/// Each field returns a confidence in [0, 1] so the form can highlight low-trust fills.
struct ScannedReceipt {
    let amount: Double?
    let amountConfidence: Float
    let amountPaid: Double?
    let vendorName: String?
    let vendorConfidence: Float
    let date: Date?
    let dateConfidence: Float
    let dueDate: Date?
    let documentReference: String?
    let paymentMethod: String?
    let paymentReference: String?
    let phoneNumber: String?
    let address: String?
    /// `true` if the receipt looks like a paid cash/card receipt;
    /// `false` if it's an unpaid invoice; `nil` if undetermined.
    let isPaid: Bool?
    /// Best-effort hint at the kind of vendor (e.g. "Hardware & Materials",
    /// "Plumbing", "Electrical"). Not authoritative — the user still picks the budget item.
    let vendorTypeHint: String?
    let imageData: Data?

    var anyExtraction: Bool {
        amount != nil || vendorName != nil || date != nil ||
            dueDate != nil || documentReference != nil || paymentMethod != nil ||
            paymentReference != nil || amountPaid != nil || phoneNumber != nil ||
            address != nil || isPaid != nil
    }
}

private extension UIImage {
    var cgImagePropertyOrientation: CGImagePropertyOrientation {
        switch imageOrientation {
        case .up: .up
        case .upMirrored: .upMirrored
        case .down: .down
        case .downMirrored: .downMirrored
        case .left: .left
        case .leftMirrored: .leftMirrored
        case .right: .right
        case .rightMirrored: .rightMirrored
        @unknown default: .up
        }
    }
}

private extension String {
    var trimmedReference: String {
        trimmingCharacters(in: CharacterSet.whitespacesAndNewlines.union(.punctuationCharacters))
    }
}

enum VisionReceiptScanner {
    enum ScannerError: Error {
        case imageEncodingFailed
        case visionRequestFailed(Error)
    }

    static func scan(image: UIImage) async throws -> ScannedReceipt {
        guard let cgImage = image.cgImage else {
            throw ScannerError.imageEncodingFailed
        }

        let observations: [VNRecognizedTextObservation] = try await withCheckedThrowingContinuation { cont in
            let request = VNRecognizeTextRequest { request, error in
                if let error {
                    cont.resume(throwing: ScannerError.visionRequestFailed(error))
                    return
                }
                cont.resume(returning: request.results as? [VNRecognizedTextObservation] ?? [])
            }
            request.recognitionLevel = .accurate
            request.usesLanguageCorrection = false
            request.recognitionLanguages = ["en-US"]

            let handler = VNImageRequestHandler(cgImage: cgImage, orientation: image.cgImagePropertyOrientation)
            do {
                try handler.perform([request])
            } catch {
                cont.resume(throwing: ScannerError.visionRequestFailed(error))
            }
        }

        let lines: [RecognizedLine] = observations.compactMap { obs in
            guard let candidate = obs.topCandidates(1).first else { return nil }
            // Higher Y in normalized coordinates = top of receipt (Vision uses bottom-left origin).
            return RecognizedLine(text: candidate.string, confidence: candidate.confidence, y: obs.boundingBox.origin.y)
        }

        let imageData = image.jpegData(compressionQuality: 0.82)
        let (amount, amountConf) = extractAmount(from: lines)
        let (vendor, vendorConf) = extractVendor(from: lines)
        let (date, dateConf) = extractDate(from: lines, dueDateOnly: false)
        let (dueDate, _) = extractDate(from: lines, dueDateOnly: true)
        let phone = extractPhone(from: lines)
        let address = extractAddress(from: lines)
        let isPaid = extractPaidStatus(from: lines)
        let documentReference = extractDocumentReference(from: lines)
        let paymentMethod = extractPaymentMethod(from: lines)
        let paymentReference = extractPaymentReference(from: lines) ?? documentReference
        let amountPaid = extractAmountPaid(from: lines, total: amount, isPaid: isPaid)
        let typeHint = vendor.flatMap { vendorTypeHint(for: $0, lines: lines) }

        return ScannedReceipt(
            amount: amount,
            amountConfidence: amountConf,
            amountPaid: amountPaid,
            vendorName: vendor,
            vendorConfidence: vendorConf,
            date: date,
            dateConfidence: dateConf,
            dueDate: dueDate,
            documentReference: documentReference,
            paymentMethod: paymentMethod,
            paymentReference: paymentReference,
            phoneNumber: phone,
            address: address,
            isPaid: isPaid,
            vendorTypeHint: typeHint,
            imageData: imageData
        )
    }

    // MARK: - Heuristic extractors

    private struct RecognizedLine {
        let text: String
        let confidence: Float
        let y: CGFloat // 0 = bottom, 1 = top in Vision normalized coords
    }

    private static let totalKeywords = ["GRAND TOTAL", "INVOICE TOTAL", "BALANCE DUE", "AMOUNT DUE", "TOTAL DUE", "TOTAL"]
    private static let paidAmountKeywords = [
        "AMOUNT PAID", "PAID AMOUNT", "PAYMENT", "PAYMENT RECEIVED",
        "CASH TENDERED", "TENDERED", "PAID"
    ]
    private static let amountRegex: NSRegularExpression = // Pattern is fixed and known-valid; force-unwrap is safe.
        // swiftlint:disable:next force_try
        try! NSRegularExpression(pattern: #"(?:\$\s?)?(\d{1,3}(?:,\d{3})*(?:\.\d{2})|\d+\.\d{2})"#)

    private static func extractAmount(from lines: [RecognizedLine]) -> (Double?, Float) {
        // Prefer lines containing a TOTAL keyword.
        let prioritized: [(line: RecognizedLine, boost: Float)] = lines.map { line in
            let upper = line.text.uppercased()
            let isTotal = totalKeywords.contains { upper.contains($0) }
            // Subtotal is a false-positive trap.
            let isRejected = upper.contains("SUBTOTAL") || upper.contains("SUB-TOTAL") || upper.contains("SUB TOTAL") ||
                upper.contains("TAX") || upper.contains("CHANGE") || upper.contains("TENDERED")
            let boost: Float = (isTotal && !isRejected) ? 0.4 : 0
            return (line, boost)
        }

        var best: (value: Double, confidence: Float)?

        for (line, boost) in prioritized {
            let nsrange = NSRange(line.text.startIndex..., in: line.text)
            let matches = amountRegex.matches(in: line.text, range: nsrange)
            for match in matches {
                guard let range = Range(match.range(at: 1), in: line.text) else { continue }
                let raw = line.text[range].replacingOccurrences(of: ",", with: "")
                guard let value = Double(raw), value > 0 else { continue }
                // Reject implausible values (>$10M).
                guard value <= 10_000_000 else { continue }
                let confidence = min(1, line.confidence + boost)
                if best == nil || confidence > best!.confidence || (confidence == best!.confidence && value > best!.value) {
                    best = (value, confidence)
                }
            }
        }

        return (best?.value, best?.confidence ?? 0)
    }

    private static func extractAmountPaid(from lines: [RecognizedLine], total: Double?, isPaid: Bool?) -> Double? {
        var best: (value: Double, confidence: Float)?

        for line in lines {
            let upper = line.text.uppercased()
            guard paidAmountKeywords.contains(where: { upper.contains($0) }) else { continue }
            guard !upper.contains("UNPAID"), !upper.contains("NOT PAID") else { continue }
            for value in amounts(in: line.text) where value > 0 {
                let confidence = min(1, line.confidence + 0.25)
                if best == nil || confidence > best!.confidence || (confidence == best!.confidence && value > best!.value) {
                    best = (value, confidence)
                }
            }
        }

        if let value = best?.value {
            return total.map { min($0, value) } ?? value
        }
        if isPaid == true, let total {
            return total
        }
        if isPaid == false {
            return 0
        }
        return nil
    }

    private static func extractVendor(from lines: [RecognizedLine]) -> (String?, Float) {
        // Top of receipt = highest y in Vision coords. Take the upper third.
        let topLines = lines.filter { $0.y > 0.66 }.sorted { $0.y > $1.y }

        for line in topLines {
            let trimmed = line.text.trimmingCharacters(in: .whitespacesAndNewlines)
            guard !trimmed.isEmpty, looksLikeVendorName(trimmed) else { continue }
            return (trimmed, line.confidence)
        }

        // Fallback to the most-confident non-junk line anywhere.
        let fallback = lines
            .filter { looksLikeVendorName($0.text.trimmingCharacters(in: .whitespacesAndNewlines)) }
            .max { $0.confidence < $1.confidence }
        return (fallback?.text.trimmingCharacters(in: .whitespacesAndNewlines), (fallback?.confidence ?? 0) * 0.7)
    }

    private static func looksLikeVendorName(_ text: String) -> Bool {
        guard text.count >= 3 else { return false }
        // Reject lines that are mostly digits/punctuation (totals, phones, dates, addresses).
        let letters = text.unicodeScalars.filter { CharacterSet.letters.contains($0) }
        let digits = text.unicodeScalars.filter { CharacterSet.decimalDigits.contains($0) }
        guard letters.count >= 3 else { return false }
        guard letters.count > digits.count else { return false }
        // Reject obvious non-name keywords.
        let upper = text.uppercased()
        let blockedTokens = ["RECEIPT", "INVOICE", "ORDER", "TOTAL", "TAX", "DATE", "TIME", "STORE", "CUSTOMER"]
        if blockedTokens.contains(where: { upper == $0 || upper.hasPrefix("\($0) ") }) { return false }
        return true
    }

    private static func extractDate(from lines: [RecognizedLine], dueDateOnly: Bool) -> (Date?, Float) {
        let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.date.rawValue)
        guard let detector else { return (nil, 0) }

        // Combine all recognized text and run the detector once.
        var bestLineConfidence: Float = 0
        var bestDate: Date?
        let now = Date()
        let twoYearsAgo = now.addingTimeInterval(-2 * 365 * 24 * 60 * 60)
        let oneYearAhead = now.addingTimeInterval(365 * 24 * 60 * 60)

        for line in lines {
            let text = line.text
            let upper = text.uppercased()
            if dueDateOnly {
                guard upper.contains("DUE") || upper.contains("PAY BY") || upper.contains("NET ") else { continue }
            } else if upper.contains("DUE") || upper.contains("PAY BY") {
                continue
            }
            let range = NSRange(text.startIndex..., in: text)
            let matches = detector.matches(in: text, options: [], range: range)
            for match in matches {
                guard let date = match.date else { continue }
                // Reject implausible dates (>1y future or >2y past — usually OCR garbage).
                guard date > twoYearsAgo, date < oneYearAhead else { continue }
                if line.confidence > bestLineConfidence {
                    bestLineConfidence = line.confidence
                    bestDate = date
                }
            }
        }

        return (bestDate, bestLineConfidence)
    }

    private static func extractDocumentReference(from lines: [RecognizedLine]) -> String? {
        let patterns = [
            #"(?i)\b(?:invoice|inv|receipt|rcpt|order|ticket|sale|transaction|trans|job|estimate|quote)\s*(?:no\.?|number|#|:)?\s*([A-Z0-9][A-Z0-9\-_/]{2,})"#,
            #"(?i)\b(?:#)\s*([A-Z0-9][A-Z0-9\-_/]{2,})"#
        ]
        return firstReferenceMatch(in: lines, patterns: patterns)
    }

    private static func extractPaymentReference(from lines: [RecognizedLine]) -> String? {
        let patterns = [
            #"(?i)\b(?:auth|authorization|approval|appr|ref|reference|trace|confirmation|conf|check|chk)\s*(?:no\.?|number|#|:)?\s*([A-Z0-9][A-Z0-9\-_/]{2,})"#,
            #"(?i)\b(?:visa|mastercard|mc|amex|discover|card).{0,12}(?:x{2,}|\*{2,}|ending in|last\s*4)?\s*([0-9]{4})\b"#
        ]
        return firstReferenceMatch(in: lines, patterns: patterns)
    }

    private static func firstReferenceMatch(in lines: [RecognizedLine], patterns: [String]) -> String? {
        let sortedLines = lines.sorted { $0.y > $1.y }
        for pattern in patterns {
            guard let regex = try? NSRegularExpression(pattern: pattern) else { continue }
            for line in sortedLines {
                let text = line.text
                let range = NSRange(text.startIndex..., in: text)
                guard let match = regex.matches(in: text, range: range).first,
                      let valueRange = Range(match.range(at: 1), in: text)
                else { continue }
                let value = String(text[valueRange]).trimmedReference
                guard value.count >= 3, !looksLikeDateOrAmount(value) else { continue }
                return value
            }
        }
        return nil
    }

    private static func extractPaymentMethod(from lines: [RecognizedLine]) -> String? {
        let upperText = lines.map { $0.text.uppercased() }.joined(separator: " ")
        let methods: [(needles: [String], method: String)] = [
            (["VISA"], "Visa"),
            (["MASTERCARD", "MASTER CARD"], "Mastercard"),
            (["AMEX", "AMERICAN EXPRESS"], "Amex"),
            (["DISCOVER"], "Discover"),
            (["DEBIT"], "Debit Card"),
            (["CREDIT"], "Credit Card"),
            (["ACH", "E-CHECK", "ECHECK"], "ACH"),
            (["CHECK", "CHK"], "Check"),
            (["CASH"], "Cash"),
            (["ZELLE"], "Zelle"),
            (["VENMO"], "Venmo"),
            (["PAYPAL", "PAY PAL"], "PayPal"),
            (["WIRE TRANSFER", "WIRE"], "Wire")
        ]
        return methods.first { entry in
            entry.needles.contains { upperText.contains($0) }
        }?.method
    }

    private static func extractPhone(from lines: [RecognizedLine]) -> String? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.phoneNumber.rawValue) else {
            return nil
        }
        for line in lines {
            let range = NSRange(line.text.startIndex..., in: line.text)
            if let match = detector.matches(in: line.text, options: [], range: range).first,
               let phone = match.phoneNumber, phone.count >= 7
            {
                return phone
            }
        }
        return nil
    }

    private static func extractAddress(from lines: [RecognizedLine]) -> String? {
        guard let detector = try? NSDataDetector(types: NSTextCheckingResult.CheckingType.address.rawValue) else {
            return nil
        }
        // Concatenate the top half of the receipt — addresses span multiple recognized lines.
        let topText = lines
            .filter { $0.y > 0.5 }
            .sorted { $0.y > $1.y }
            .map(\.text)
            .joined(separator: ", ")
        let range = NSRange(topText.startIndex..., in: topText)
        guard let match = detector.matches(in: topText, options: [], range: range).first,
              let stringRange = Range(match.range, in: topText)
        else {
            return nil
        }
        return String(topText[stringRange]).trimmingCharacters(in: .whitespacesAndNewlines)
    }

    private static func extractPaidStatus(from lines: [RecognizedLine]) -> Bool? {
        let upperText = lines.map { $0.text.uppercased() }.joined(separator: " ")
        // Strong unpaid signals.
        if upperText.contains("BALANCE DUE") || upperText.contains("AMOUNT DUE") ||
            upperText.contains("PAY BY") || upperText.contains("PLEASE REMIT") ||
            upperText.contains("INVOICE")
        {
            // But if it also says "PAID" near the balance, treat as paid.
            if upperText.contains("PAID IN FULL") || upperText.contains("BALANCE PAID") {
                return true
            }
            return false
        }
        // Strong paid signals.
        if upperText.contains("CHANGE DUE") || upperText.contains("CASH TENDERED") ||
            upperText.contains("PAYMENT RECEIVED") || upperText.contains("APPROVED") ||
            upperText.contains("PAID")
        {
            return true
        }
        return nil
    }

    private static func amounts(in text: String) -> [Double] {
        let nsrange = NSRange(text.startIndex..., in: text)
        return amountRegex.matches(in: text, range: nsrange).compactMap { match in
            guard let range = Range(match.range(at: 1), in: text) else { return nil }
            let raw = text[range].replacingOccurrences(of: ",", with: "")
            guard let value = Double(raw), value > 0, value <= 10_000_000 else { return nil }
            return value
        }
    }

    private static func looksLikeDateOrAmount(_ value: String) -> Bool {
        if value.contains(".") || value.contains("/") { return true }
        return false
    }

    private static let vendorTypeMap: [(needles: [String], hint: String)] = [
        (["HOME DEPOT", "LOWE", "MENARDS", "ACE HARDWARE", "84 LUMBER", "BUILDERS"], "Hardware & Materials"),
        (["FERGUSON", "PLUMBING SUPPLY", "WINSUPPLY"], "Plumbing"),
        (["GRAYBAR", "ELECTRIC SUPPLY", "ELECTRICAL"], "Electrical"),
        (["SHERWIN", "BENJAMIN MOORE", "PAINT"], "Paint"),
        (["FLOORING", "TILE", "STONE"], "Flooring & Tile"),
        (["WINDOW", "GLASS"], "Windows"),
        (["LANDSCAP", "NURSERY"], "Landscaping"),
        (["INSPECTION"], "Inspections"),
        (["PERMIT"], "Permits & Approvals")
    ]

    private static func vendorTypeHint(for vendor: String, lines: [RecognizedLine]) -> String? {
        let haystack = (vendor + " " + lines.prefix(8).map(\.text).joined(separator: " ")).uppercased()
        for entry in vendorTypeMap where entry.needles.contains(where: { haystack.contains($0) }) {
            return entry.hint
        }
        return nil
    }
}
