import Foundation

enum ProjectExportScope: String, CaseIterable, Identifiable {
    case dataOnly
    case photosOnly
    case documentsOnly
    case all

    var id: String {
        rawValue
    }

    var title: String {
        switch self {
        case .dataOnly: "Data Only"
        case .photosOnly: "Photos Only"
        case .documentsOnly: "Documents Only"
        case .all: "All"
        }
    }

    var subtitle: String {
        switch self {
        case .dataOnly: "Project, budget, expenses, vendors and changes"
        case .photosOnly: "Jobsite photo log images"
        case .documentsOnly: "Surveys, permits, plans and receipts"
        case .all: "Data, photos, documents and receipts"
        }
    }

    var systemImage: String {
        switch self {
        case .dataOnly: "tablecells"
        case .photosOnly: "photo.on.rectangle"
        case .documentsOnly: "folder"
        case .all: "shippingbox"
        }
    }
}

enum ProjectExportService {
    static func createArchive(
        project: Project,
        scope: ProjectExportScope,
        items: [BudgetLineItem],
        expenses: [Expense],
        photos: [PhotoAttachment],
        documents: [ProjectDocument],
        changeOrders: [ChangeOrder],
        vendors: [Vendor],
        allowanceSelections: [AllowanceSelection] = []
    ) throws -> URL {
        let timestamp = ExportNaming.timestamp()
        let archiveBaseName = ExportNaming.archiveBaseName(project: project, scope: scope, timestamp: timestamp)
        var zip = ZipArchiveBuilder()

        if scope == .dataOnly || scope == .all {
            addDataFiles(
                to: &zip,
                timestamp: timestamp,
                project: project,
                items: items,
                expenses: expenses,
                photos: photos,
                documents: documents,
                changeOrders: changeOrders,
                vendors: vendors,
                allowanceSelections: allowanceSelections
            )
        }

        if scope == .photosOnly || scope == .all {
            for photo in photos {
                guard let data = photo.imageData else { continue }
                let folder = photoExportFolder(for: photo)
                let name = photoExportFileName(for: photo)
                zip.addFile(
                    path: "Photos/\(folder.safeArchivePathComponent)/\(name.safeArchivePathComponent)",
                    data: data,
                    modifiedAt: photo.createdAt
                )
            }
        }

        if scope == .documentsOnly || scope == .all {
            for document in documents {
                guard let data = document.fileData else { continue }
                zip.addFile(
                    path: "Documents/\(document.kind.title.safeArchivePathComponent)/\(document.fileName.safeArchivePathComponent)",
                    data: data,
                    modifiedAt: document.uploadedAt
                )
            }

            for expense in expenses where expense.receiptImageData != nil {
                guard let data = expense.receiptImageData else { continue }
                let name = "\(expense.date.fileDateString)-\(expense.vendorName)-\(expense.id.uuidString.prefix(6)).jpg"
                zip.addFile(
                    path: "Documents/\(ProjectDocumentKind.receiptsWarranties.title.safeArchivePathComponent)/\(name.safeArchivePathComponent)",
                    data: data,
                    modifiedAt: expense.date
                )
            }
        }

        zip.addTextFile(
            path: "Export Manifest.txt",
            text: exportManifest(
                project: project,
                scope: scope,
                timestamp: timestamp,
                items: items,
                expenses: expenses,
                photos: photos,
                documents: documents,
                changeOrders: changeOrders,
                vendors: vendors,
                allowanceSelections: allowanceSelections
            )
        )

        let data = zip.makeData()
        let fileName = "\(archiveBaseName).zip"
        let url = FileManager.default.temporaryDirectory.appending(path: fileName)
        try data.write(to: url, options: .atomic)
        return url
    }

    private static func addDataFiles(
        to zip: inout ZipArchiveBuilder,
        timestamp: String,
        project: Project,
        items: [BudgetLineItem],
        expenses: [Expense],
        photos: [PhotoAttachment],
        documents: [ProjectDocument],
        changeOrders: [ChangeOrder],
        vendors: [Vendor],
        allowanceSelections: [AllowanceSelection]
    ) {
        let workbook = ProjectWorkbookService.makeWorkbook(
            project: project,
            items: items,
            expenses: expenses,
            documents: documents,
            changeOrders: changeOrders,
            vendors: vendors,
            photos: photos,
            allowanceSelections: allowanceSelections
        )
        let fileName = "\(project.name.safeArchivePathComponent)-Data-\(timestamp).xls"
        zip.addTextFile(path: "Data/\(fileName)", text: workbook)
    }

    private static func photoExportFolder(for photo: PhotoAttachment) -> String {
        let folder = photo.phaseTag.trimmed
        return folder.isEmpty ? "Uncategorized Photos" : "\(folder) Photos"
    }

    private static func photoExportFileName(for photo: PhotoAttachment) -> String {
        let area = photo.roomTag.trimmed.isEmpty ? "Photo" : photo.roomTag.trimmed
        let category = photo.categoryName.trimmed.isEmpty ? photo.phaseTag.trimmed : photo.categoryName.trimmed
        let prefix = [photo.createdAt.fileDateTimeString, category, area]
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        return "\(prefix)-\(photo.id.uuidString.prefix(6)).jpg"
    }

    private static func exportManifest(
        project: Project,
        scope: ProjectExportScope,
        timestamp: String,
        items: [BudgetLineItem],
        expenses: [Expense],
        photos: [PhotoAttachment],
        documents: [ProjectDocument],
        changeOrders: [ChangeOrder],
        vendors: [Vendor],
        allowanceSelections: [AllowanceSelection]
    ) -> String {
        """
        HomeBuild Pro Export
        Project: \(project.name)
        Address: \(project.address)
        Status: \(project.status.title)
        Priority: \(project.priority.title)
        Scope: \(scope.title)
        Exported: \(timestamp)

        Counts
        Budget Items: \(items.count)
        Expenses: \(expenses.count)
        Photos: \(photos.count)
        Documents: \(documents.count)
        Vendors: \(vendors.count)
        Change Orders: \(changeOrders.count)
        Allowance Selections: \(allowanceSelections.count)

        Data exports include one Excel workbook with separate sheets.
        Photo exports are organized by photo folder/category.
        Document exports are organized by document type.
        """
    }
}

private enum ExportNaming {
    static func timestamp(date: Date = .now) -> String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmmss"
        return formatter.string(from: date)
    }

    static func archiveBaseName(project: Project, scope: ProjectExportScope, timestamp: String) -> String {
        "\(project.name.safeArchivePathComponent)-\(scope.fileSlug)-\(timestamp)"
    }
}

private extension ProjectExportScope {
    var fileSlug: String {
        switch self {
        case .dataOnly: "Data"
        case .photosOnly: "Photos"
        case .documentsOnly: "Documents"
        case .all: "Full-Export"
        }
    }
}

struct ZipArchiveBuilder {
    private struct Entry {
        let path: String
        let data: Data
        let crc: UInt32
        let modifiedAt: Date
        let localHeaderOffset: UInt32
    }

    private var fileData = Data()
    private var entries: [Entry] = []

    mutating func addTextFile(path: String, text: String) {
        addFile(path: path, data: Data(text.utf8), modifiedAt: .now)
    }

    mutating func addFile(path: String, data: Data, modifiedAt: Date) {
        guard let nameData = path.data(using: .utf8), data.count <= Int(UInt32.max), fileData.count <= Int(UInt32.max) else { return }

        let offset = UInt32(fileData.count)
        let crc = CRC32.checksum(data)
        let dos = DOSDateTime(date: modifiedAt)

        fileData.appendUInt32LE(0x0403_4B50)
        fileData.appendUInt16LE(20)
        fileData.appendUInt16LE(0)
        fileData.appendUInt16LE(0)
        fileData.appendUInt16LE(dos.time)
        fileData.appendUInt16LE(dos.date)
        fileData.appendUInt32LE(crc)
        fileData.appendUInt32LE(UInt32(data.count))
        fileData.appendUInt32LE(UInt32(data.count))
        fileData.appendUInt16LE(UInt16(nameData.count))
        fileData.appendUInt16LE(0)
        fileData.append(nameData)
        fileData.append(data)

        entries.append(Entry(path: path, data: data, crc: crc, modifiedAt: modifiedAt, localHeaderOffset: offset))
    }

    func makeData() -> Data {
        var output = fileData
        let centralDirectoryOffset = UInt32(output.count)

        for entry in entries {
            guard let nameData = entry.path.data(using: .utf8) else { continue }
            let dos = DOSDateTime(date: entry.modifiedAt)

            output.appendUInt32LE(0x0201_4B50)
            output.appendUInt16LE(20)
            output.appendUInt16LE(20)
            output.appendUInt16LE(0)
            output.appendUInt16LE(0)
            output.appendUInt16LE(dos.time)
            output.appendUInt16LE(dos.date)
            output.appendUInt32LE(entry.crc)
            output.appendUInt32LE(UInt32(entry.data.count))
            output.appendUInt32LE(UInt32(entry.data.count))
            output.appendUInt16LE(UInt16(nameData.count))
            output.appendUInt16LE(0)
            output.appendUInt16LE(0)
            output.appendUInt16LE(0)
            output.appendUInt16LE(0)
            output.appendUInt32LE(0)
            output.appendUInt32LE(entry.localHeaderOffset)
            output.append(nameData)
        }

        let centralDirectorySize = UInt32(output.count) - centralDirectoryOffset
        output.appendUInt32LE(0x0605_4B50)
        output.appendUInt16LE(0)
        output.appendUInt16LE(0)
        output.appendUInt16LE(UInt16(entries.count))
        output.appendUInt16LE(UInt16(entries.count))
        output.appendUInt32LE(centralDirectorySize)
        output.appendUInt32LE(centralDirectoryOffset)
        output.appendUInt16LE(0)
        return output
    }
}

private struct DOSDateTime {
    let date: UInt16
    let time: UInt16

    init(date input: Date) {
        var calendar = Calendar(identifier: .gregorian)
        calendar.timeZone = TimeZone(identifier: "UTC") ?? .current
        let components = calendar.dateComponents([.year, .month, .day, .hour, .minute, .second], from: input)
        let year = max((components.year ?? 1980) - 1980, 0)
        let month = components.month ?? 1
        let day = components.day ?? 1
        let hour = components.hour ?? 0
        let minute = components.minute ?? 0
        let second = (components.second ?? 0) / 2

        date = UInt16((year << 9) | (month << 5) | day)
        time = UInt16((hour << 11) | (minute << 5) | second)
    }
}

private enum CRC32 {
    private static let table: [UInt32] = (0 ..< 256).map { index in
        var value = UInt32(index)
        for _ in 0 ..< 8 {
            if value & 1 == 1 {
                value = 0xEDB8_8320 ^ (value >> 1)
            } else {
                value >>= 1
            }
        }
        return value
    }

    static func checksum(_ data: Data) -> UInt32 {
        var crc: UInt32 = 0xFFFF_FFFF
        for byte in data {
            let index = Int((crc ^ UInt32(byte)) & 0xFF)
            crc = table[index] ^ (crc >> 8)
        }
        return crc ^ 0xFFFF_FFFF
    }
}

private extension Data {
    mutating func appendUInt16LE(_ value: UInt16) {
        append(UInt8(value & 0x00FF))
        append(UInt8((value & 0xFF00) >> 8))
    }

    mutating func appendUInt32LE(_ value: UInt32) {
        append(UInt8(value & 0x0000_00FF))
        append(UInt8((value & 0x0000_FF00) >> 8))
        append(UInt8((value & 0x00FF_0000) >> 16))
        append(UInt8((value & 0xFF00_0000) >> 24))
    }
}

private extension String {
    var safeArchivePathComponent: String {
        let invalid = CharacterSet(charactersIn: "/\\?%*|\"<>:")
        var cleaned = components(separatedBy: invalid).joined(separator: "-").trimmed
        // Collapse runs of whitespace into single dashes for shell-safe filenames.
        cleaned = cleaned
            .components(separatedBy: .whitespacesAndNewlines)
            .filter { !$0.isEmpty }
            .joined(separator: "-")
        return cleaned.isEmpty ? "Untitled" : cleaned
    }
}

private extension Date {
    var fileDateString: String {
        formatted(.iso8601.year().month().day())
    }

    var fileDateTimeString: String {
        let formatter = DateFormatter()
        formatter.calendar = Calendar(identifier: .gregorian)
        formatter.locale = Locale(identifier: "en_US_POSIX")
        formatter.dateFormat = "yyyyMMdd-HHmm"
        return formatter.string(from: self)
    }
}
