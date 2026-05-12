import SwiftData
import SwiftUI

private enum PhotoLibraryMode: String, CaseIterable, Identifiable {
    case folders = "Folders"
    case allPhotos = "All Photos"

    var id: String {
        rawValue
    }
}

private enum PhotoDateFilter: String, CaseIterable, Identifiable {
    case all
    case today
    case sevenDays
    case thirtyDays
    case ninetyDays

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all: "All"
        case .today: "Today"
        case .sevenDays: "7 days"
        case .thirtyDays: "30 days"
        case .ninetyDays: "90 days"
        }
    }

    var systemImage: String {
        switch self {
        case .all: "calendar"
        case .today: "sun.max"
        case .sevenDays: "calendar.day.timeline.left"
        case .thirtyDays: "calendar"
        case .ninetyDays: "calendar.badge.clock"
        }
    }

    func contains(_ date: Date, relativeTo reference: Date = .now, calendar: Calendar = .current) -> Bool {
        switch self {
        case .all:
            return true
        case .today:
            return calendar.isDate(date, inSameDayAs: reference)
        case .sevenDays:
            return windowContains(date, days: 7, reference: reference, calendar: calendar)
        case .thirtyDays:
            return windowContains(date, days: 30, reference: reference, calendar: calendar)
        case .ninetyDays:
            return windowContains(date, days: 90, reference: reference, calendar: calendar)
        }
    }

    private func windowContains(_ date: Date, days: Int, reference: Date, calendar: Calendar) -> Bool {
        guard let cutoff = calendar.date(byAdding: .day, value: -days, to: reference) else { return true }
        return date >= cutoff
    }
}

struct PhotosView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project

    @Query private var photos: [PhotoAttachment]
    @Query private var items: [BudgetLineItem]

    @State private var showingAddPhoto = false
    @State private var showingEditPhoto = false
    @State private var photoIDToEdit: UUID?
    @State private var taskPhotoID: UUID?
    @State private var selectedFolder = "All"
    @State private var photoError: String?
    @State private var searchQuery = ""
    @State private var viewerContext: PhotoViewerContext?

    @AppStorage(AppSettingsKeys.photosNewestFirst) private var newestFirst = true
    @AppStorage(AppSettingsKeys.photosLibraryMode) private var libraryModeRaw = PhotoLibraryMode.folders.rawValue
    @AppStorage(AppSettingsKeys.photosDateFilter) private var dateFilterRaw = PhotoDateFilter.all.rawValue

    @ObservedObject private var health = StorageHealthMonitor.shared

    init(project: Project) {
        self.project = project
        let projectID = project.id
        _photos = Query(filter: #Predicate<PhotoAttachment> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
    }

    private let columns = [
        GridItem(.flexible(), spacing: 12, alignment: .top),
        GridItem(.flexible(), spacing: 12, alignment: .top)
    ]

    // MARK: - Derived state

    private var libraryMode: PhotoLibraryMode {
        get { PhotoLibraryMode(rawValue: libraryModeRaw) ?? .folders }
    }

    private var dateFilter: PhotoDateFilter {
        get { PhotoDateFilter(rawValue: dateFilterRaw) ?? .all }
    }

    private var sortedPhotos: [PhotoAttachment] {
        newestFirst ? photos : Array(photos.reversed())
    }

    /// Photos AFTER applying the date filter + search query. Folder filter happens later because
    /// the folder bar's per-folder counts should reflect the same date/search scope.
    private var scopedPhotos: [PhotoAttachment] {
        let filter = dateFilter
        let query = searchQuery.trimmed.localizedLowercase
        return sortedPhotos.filter { photo in
            guard filter.contains(photo.createdAt) else { return false }
            guard !query.isEmpty else { return true }
            return matches(photo, query: query)
        }
    }

    private var displayedPhotos: [PhotoAttachment] {
        selectedFolder == "All" ? scopedPhotos : scopedPhotos.filter { folderName(for: $0) == selectedFolder }
    }

    private var folderFilters: [String] {
        let usedFolders = Set(scopedPhotos.map { folderName(for: $0) })
        var filters = ["All"]
        filters.append(contentsOf: PhotoFormViewModel.photoFolderOptions.filter { usedFolders.contains($0) })
        let extras = scopedPhotos
            .map { folderName(for: $0) }
            .filter { !filters.contains($0) }
            .sorted()
        filters.append(contentsOf: extras)
        return filters
    }

    private var folderSections: [(name: String, photos: [PhotoAttachment])] {
        let grouped = Dictionary(grouping: scopedPhotos, by: folderName(for:))
        return folderFilters
            .filter { $0 != "All" }
            .compactMap { name -> (String, [PhotoAttachment])? in
                guard let photos = grouped[name], !photos.isEmpty else { return nil }
                return (name, photos)
            }
    }

    private var folderCount: Int {
        folderSections.count
    }

    private var photosThisWeek: Int {
        let cutoff = Calendar.current.date(byAdding: .day, value: -7, to: .now) ?? .now
        return photos.filter { $0.createdAt >= cutoff }.count
    }

    private var hasSearchOrFilter: Bool {
        !searchQuery.trimmed.isEmpty || dateFilter != .all || selectedFolder != "All"
    }

    private func folderName(for photo: PhotoAttachment) -> String {
        let name = photo.phaseTag.trimmed
        return name.isEmpty ? "Uncategorized" : name
    }

    private func count(for folder: String) -> Int {
        folder == "All" ? scopedPhotos.count : scopedPhotos.filter { folderName(for: $0) == folder }.count
    }

    private func matches(_ photo: PhotoAttachment, query: String) -> Bool {
        let haystack = [
            photo.roomTag,
            photo.phaseTag,
            photo.categoryName,
            photo.notes
        ]
        .map { $0.localizedLowercase }
        return haystack.contains { $0.contains(query) }
    }

    private func linkedItemTitle(for photo: PhotoAttachment) -> String? {
        guard let itemID = photo.budgetLineItemID,
              let item = items.first(where: { $0.id == itemID })
        else { return nil }
        return "\(item.costCode) — \(item.title)"
    }

    // MARK: - Body

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    photoHeader
                    receiptsTile
                    libraryTabs

                    if libraryMode == .folders {
                        folderBar
                    }

                    dateFilterBar

                    photoContent
                }
                .padding(.top, 8)
            }
            .background(AppTheme.pageBackground)
            .navigationTitle("Photos")
            .searchable(text: $searchQuery, placement: .navigationBarDrawer(displayMode: .always), prompt: "Search notes, rooms, folders")
            .primaryFloatingAction(title: "Photo", systemImage: "camera.fill") {
                showingAddPhoto = true
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    sortMenu
                }
            }
            .sheet(isPresented: $showingAddPhoto) {
                AddPhotoView(project: project)
            }
            .sheet(isPresented: $showingEditPhoto, onDismiss: {
                photoIDToEdit = nil
            }) {
                if let photoIDToEdit, let photoToEdit = fetchPhoto(withID: photoIDToEdit) {
                    AddPhotoView(project: project, photo: photoToEdit)
                }
            }
            .sheet(item: taskPhotoBinding) { photoID in
                AddTaskView(project: project, seedPhotoID: photoID.id)
            }
            .fullScreenCover(item: $viewerContext) { ctx in
                PhotoViewer(
                    context: ctx,
                    onEdit: { photo in
                        photoIDToEdit = photo.id
                        showingEditPhoto = true
                    },
                    onDelete: { photo in
                        deletePhoto(withID: photo.id)
                    }
                )
            }
            .alert(
                "Photo Error",
                isPresented: Binding(
                    get: { photoError != nil },
                    set: { isPresented in
                        if !isPresented {
                            photoError = nil
                        }
                    }
                )
            ) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(photoError ?? "")
            }
        }
    }

    // MARK: - Header

    private var photoHeader: some View {
        PremiumCard {
            VStack(alignment: .leading, spacing: 10) {
                HStack(alignment: .firstTextBaseline, spacing: 10) {
                    VStack(alignment: .leading, spacing: 2) {
                        Text("Jobsite Photo Log")
                            .font(.headline.weight(.semibold))
                        Text("\(photos.count) photos · \(folderCount) folders")
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                    }
                    Spacer()
                    backupBadge
                }

                HStack(spacing: 12) {
                    headerMetric(value: "\(photosThisWeek)", label: "This week", systemImage: "calendar.day.timeline.left")
                    headerMetric(value: "\(scopedPhotos.count)", label: "In view", systemImage: "viewfinder")
                }
            }
        }
        .padding(.horizontal, AppTheme.pagePadding)
    }

    private func headerMetric(value: String, label: String, systemImage: String) -> some View {
        HStack(spacing: 8) {
            Image(systemName: systemImage)
                .font(.caption.weight(.bold))
                .foregroundStyle(AppTheme.accent)
                .frame(width: 28, height: 28)
                .background(AppTheme.accent.opacity(0.13), in: RoundedRectangle(cornerRadius: 8, style: .continuous))
            VStack(alignment: .leading, spacing: 1) {
                Text(value)
                    .font(.subheadline.weight(.bold))
                Text(label)
                    .font(.caption2)
                    .foregroundStyle(.secondary)
            }
        }
        .frame(maxWidth: .infinity, alignment: .leading)
        .padding(.vertical, 4)
        .padding(.horizontal, 8)
        .background(AppTheme.surfaceSunken, in: RoundedRectangle(cornerRadius: 10, style: .continuous))
    }

    @ViewBuilder
    private var backupBadge: some View {
        switch health.iCloudAvailable {
        case .some(true):
            Label("Backed up", systemImage: "icloud.fill")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.green)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.green.opacity(0.13), in: Capsule())
        case .some(false):
            Label("Local only", systemImage: "iphone")
                .font(.caption2.weight(.bold))
                .foregroundStyle(.orange)
                .padding(.horizontal, 8)
                .padding(.vertical, 4)
                .background(Color.orange.opacity(0.13), in: Capsule())
        case .none:
            EmptyView()
        }
    }

    // MARK: - Receipts tile

    private var receiptsTile: some View {
        NavigationLink {
            ReceiptsGalleryView(project: project)
        } label: {
            HStack(spacing: AppTheme.Space.sm) {
                Image(systemName: "doc.viewfinder")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(AppTheme.brand)
                    .frame(width: 36, height: 36)
                    .background(
                        RoundedRectangle(cornerRadius: AppTheme.Radius.sm, style: .continuous)
                            .fill(AppTheme.brandSoft)
                    )

                VStack(alignment: .leading, spacing: 2) {
                    Text("Receipts & Invoices")
                        .font(AppFont.subheadline.weight(.semibold))
                        .foregroundStyle(AppTheme.ink)
                    Text("Scanned receipts saved to Files.app")
                        .font(AppFont.caption2)
                        .foregroundStyle(AppTheme.inkTertiary)
                }

                Spacer()

                Image(systemName: "chevron.right")
                    .font(.caption.weight(.bold))
                    .foregroundStyle(AppTheme.inkTertiary)
            }
            .padding(AppTheme.Space.sm)
            .background(
                RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous)
                    .fill(AppTheme.surface)
            )
            .overlay(
                RoundedRectangle(cornerRadius: AppTheme.Radius.md, style: .continuous)
                    .strokeBorder(AppTheme.border, lineWidth: 0.75)
            )
        }
        .buttonStyle(.plain)
        .padding(.horizontal, AppTheme.pagePadding)
    }

    // MARK: - Library / folder / date filters

    private var libraryTabs: some View {
        Picker("Photo View", selection: Binding(
            get: { PhotoLibraryMode(rawValue: libraryModeRaw) ?? .folders },
            set: { libraryModeRaw = $0.rawValue }
        )) {
            ForEach(PhotoLibraryMode.allCases) { mode in
                Text(mode.rawValue).tag(mode)
            }
        }
        .pickerStyle(.segmented)
        .padding(.horizontal, AppTheme.pagePadding)
    }

    private var folderBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(folderFilters, id: \.self) { folder in
                    Button {
                        withAnimation(.smooth(duration: 0.2)) {
                            selectedFolder = folderFilters.contains(folder) ? folder : "All"
                        }
                    } label: {
                        HStack(spacing: 7) {
                            Image(systemName: folder == "All" ? "photo.stack" : "folder.fill")
                                .font(.caption.weight(.bold))

                            Text(folder)
                                .lineLimit(1)
                                .truncationMode(.tail)

                            Text("\(count(for: folder))")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(selectedFolder == folder ? .white.opacity(0.72) : .secondary)
                        }
                        .font(.caption.weight(.bold))
                        .foregroundStyle(selectedFolder == folder ? .white : .primary)
                        .padding(.horizontal, 12)
                        .padding(.vertical, 9)
                        .background(selectedFolder == folder ? AppTheme.accent : AppTheme.cardBackground, in: Capsule())
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, AppTheme.pagePadding)
        }
    }

    private var dateFilterBar: some View {
        ScrollView(.horizontal, showsIndicators: false) {
            HStack(spacing: 8) {
                ForEach(PhotoDateFilter.allCases) { option in
                    Button {
                        withAnimation(.smooth(duration: 0.2)) {
                            dateFilterRaw = option.rawValue
                        }
                    } label: {
                        Label(option.title, systemImage: option.systemImage)
                            .font(.caption.weight(.bold))
                            .foregroundStyle(dateFilter == option ? .white : .primary)
                            .padding(.horizontal, 12)
                            .padding(.vertical, 8)
                            .background(dateFilter == option ? AppTheme.brand : AppTheme.surface, in: Capsule())
                            .overlay(
                                Capsule()
                                    .strokeBorder(dateFilter == option ? Color.clear : AppTheme.border, lineWidth: 0.75)
                            )
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, AppTheme.pagePadding)
        }
    }

    // MARK: - Content

    @ViewBuilder
    private var photoContent: some View {
        if photos.isEmpty {
            EmptyStateView(
                title: "No photos yet",
                subtitle: "Capture jobsite progress, finishes and material deliveries.",
                systemImage: "camera"
            )
            .padding(.top, 60)
            .padding(.horizontal, AppTheme.pagePadding)

            Button {
                showingAddPhoto = true
            } label: {
                Label("Take first photo", systemImage: "camera.fill")
                    .frame(maxWidth: .infinity)
                    .padding(.vertical, 4)
            }
            .buttonStyle(.borderedProminent)
            .padding(.horizontal, AppTheme.pagePadding)
            .padding(.top, 8)
        } else if scopedPhotos.isEmpty {
            EmptyStateView(
                title: hasSearchOrFilter ? "No matches" : "No photos in this view",
                subtitle: hasSearchOrFilter
                    ? "Clear the search or date filter to see all photos."
                    : "Add a photo or change the date filter.",
                systemImage: "magnifyingglass"
            )
            .padding(.top, 40)
            .padding(.horizontal, AppTheme.pagePadding)

            if hasSearchOrFilter {
                Button("Clear filters") {
                    searchQuery = ""
                    dateFilterRaw = PhotoDateFilter.all.rawValue
                    selectedFolder = "All"
                }
                .buttonStyle(.bordered)
                .padding(.horizontal, AppTheme.pagePadding)
                .padding(.top, 4)
            }
        } else if libraryMode == .allPhotos {
            photoGrid(scopedPhotos)
                .padding(.horizontal, AppTheme.pagePadding)
                .padding(.bottom, 92)
        } else if selectedFolder == "All" {
            LazyVGrid(columns: columns, spacing: 12) {
                ForEach(folderSections, id: \.name) { section in
                    Button {
                        withAnimation(.smooth(duration: 0.2)) {
                            selectedFolder = section.name
                        }
                    } label: {
                        PhotoFolderCard(name: section.name, photos: section.photos)
                    }
                    .buttonStyle(.plain)
                }
            }
            .padding(.horizontal, AppTheme.pagePadding)
            .padding(.bottom, 92)
        } else {
            photoGrid(displayedPhotos)
                .padding(.horizontal, AppTheme.pagePadding)
                .padding(.bottom, 92)
        }
    }

    private func photoGrid(_ visiblePhotos: [PhotoAttachment]) -> some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(Array(visiblePhotos.enumerated()), id: \.element.id) { index, photo in
                PhotoGridTile(photo: photo)
                    .onTapGesture {
                        viewerContext = PhotoViewerContext(
                            photos: visiblePhotos,
                            initialIndex: index,
                            linkedItemTitle: { linkedItemTitle(for: $0) }
                        )
                    }
                    .contextMenu {
                        Button {
                            photoIDToEdit = photo.id
                            showingEditPhoto = true
                        } label: {
                            Label("Edit", systemImage: "pencil")
                        }

                        Button {
                            taskPhotoID = photo.id
                        } label: {
                            Label("Create Task", systemImage: "checklist")
                        }

                        Button(role: .destructive) {
                            deletePhoto(withID: photo.id)
                        } label: {
                            Label("Delete", systemImage: "trash")
                        }
                    }
            }
        }
    }

    // MARK: - Sort menu

    private var sortMenu: some View {
        Menu {
            Picker("Sort", selection: $newestFirst) {
                Label("Newest first", systemImage: "arrow.down").tag(true)
                Label("Oldest first", systemImage: "arrow.up").tag(false)
            }
        } label: {
            Image(systemName: "arrow.up.arrow.down")
        }
        .accessibilityLabel("Sort photos")
    }

    // MARK: - State plumbing

    private var taskPhotoBinding: Binding<TaskPhotoSeed?> {
        Binding(
            get: { taskPhotoID.map(TaskPhotoSeed.init(id:)) },
            set: { seed in taskPhotoID = seed?.id }
        )
    }

    private func deletePhoto(withID photoID: UUID) {
        do {
            guard let photo = fetchPhoto(withID: photoID) else { return }
            let deletedPhotoID = photo.id
            modelContext.delete(photo)
            try modelContext.save()
            MediaStorageService.removePhoto(id: deletedPhotoID, project: project)
        } catch {
            modelContext.safeRollback()
            photoError = "Could not delete photo: \(error.localizedDescription)"
        }
    }

    private func fetchPhoto(withID photoID: UUID) -> PhotoAttachment? {
        let projectID = project.id
        let descriptor = FetchDescriptor<PhotoAttachment>(
            predicate: #Predicate { $0.id == photoID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }
}

private struct TaskPhotoSeed: Identifiable {
    let id: UUID
}

private struct PhotoGridTile: View {
    let photo: PhotoAttachment

    var body: some View {
        GeometryReader { proxy in
            let side = max(0, proxy.size.width - 16)

            VStack(alignment: .leading, spacing: 8) {
                PhotoTilePreview(data: photo.imageData)
                    .frame(width: side, height: side)
                    .overlay(alignment: .bottomTrailing) {
                        Text(photo.createdAt.shortDateString)
                            .font(.caption2.weight(.bold))
                            .foregroundStyle(.white)
                            .padding(.horizontal, 7)
                            .padding(.vertical, 4)
                            .background(.black.opacity(0.48), in: Capsule())
                            .padding(7)
                    }

                VStack(alignment: .leading, spacing: 3) {
                    Text(primaryTitle)
                        .font(.subheadline.weight(.semibold))
                        .lineLimit(1)
                        .truncationMode(.tail)

                    Text(secondaryTitle)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(1)
                        .truncationMode(.tail)
                }
                .padding(.horizontal, 2)
                .frame(width: side, height: 42, alignment: .topLeading)
            }
            .padding(8)
            .frame(width: proxy.size.width, height: proxy.size.height, alignment: .topLeading)
            .background(AppTheme.cardBackground, in: RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous))
            .overlay {
                RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous)
                    .strokeBorder(AppTheme.border, lineWidth: 1)
            }
        }
        .aspectRatio(0.72, contentMode: .fit)
    }

    private var primaryTitle: String {
        if !photo.roomTag.trimmed.isEmpty {
            return photo.roomTag.trimmed
        }

        if !photo.categoryName.trimmed.isEmpty {
            return photo.categoryName.trimmed
        }

        return "Photo"
    }

    private var secondaryTitle: String {
        photo.notes.trimmed.isEmpty ? photo.createdAt.timelineString : photo.notes.trimmed
    }
}

private struct PhotoFolderCard: View {
    let name: String
    let photos: [PhotoAttachment]

    var body: some View {
        VStack(alignment: .leading, spacing: 9) {
            ZStack(alignment: .bottomLeading) {
                PhotoTilePreview(data: photos.first?.imageData)
                    .frame(height: 112)
                    .frame(maxWidth: .infinity)

                LinearGradient(
                    colors: [.clear, .black.opacity(0.44)],
                    startPoint: .center,
                    endPoint: .bottom
                )
                .clipShape(RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous))

                Image(systemName: "folder.fill")
                    .font(.headline.weight(.semibold))
                    .foregroundStyle(.white)
                    .padding(10)
            }

            VStack(alignment: .leading, spacing: 3) {
                Text(name)
                    .font(.subheadline.weight(.semibold))
                    .lineLimit(1)
                    .minimumScaleFactor(0.82)
                    .truncationMode(.tail)

                Text("\(photos.count) photo\(photos.count == 1 ? "" : "s")")
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
            .frame(height: 40, alignment: .topLeading)
        }
        .padding(8)
        .frame(maxWidth: .infinity)
        .background(AppTheme.cardBackground, in: RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous))
        .overlay {
            RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous)
                .strokeBorder(AppTheme.border, lineWidth: 1)
        }
        .contentShape(RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous))
    }
}

private struct PhotoTilePreview: View {
    let data: Data?

    var body: some View {
        ZStack {
            RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous)
                .fill(AppTheme.surfaceSunken)

            PhotoThumbnail(data: data, contentMode: .fit)
                .padding(6)
        }
        .clipShape(RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous))
    }
}
