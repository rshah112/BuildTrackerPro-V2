import SwiftData
import SwiftUI

private enum PhotoLibraryMode: String, CaseIterable, Identifiable {
    case folders = "Folders"
    case allPhotos = "All Photos"

    var id: String {
        rawValue
    }
}

struct PhotosView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project

    @Query private var photos: [PhotoAttachment]

    @State private var showingAddPhoto = false
    @State private var showingEditPhoto = false
    @State private var selectedPhoto: PhotoAttachment?
    @State private var photoIDToEdit: UUID?
    @State private var newestFirst = true
    @State private var selectedFolder = "All"
    @State private var libraryMode: PhotoLibraryMode = .folders
    @State private var photoError: String?

    init(project: Project) {
        self.project = project
        let projectID = project.id
        _photos = Query(filter: #Predicate<PhotoAttachment> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
    }

    private let columns = [
        GridItem(.flexible(), spacing: 12, alignment: .top),
        GridItem(.flexible(), spacing: 12, alignment: .top)
    ]

    private var sortedPhotos: [PhotoAttachment] {
        newestFirst ? photos : Array(photos.reversed())
    }

    private var displayedPhotos: [PhotoAttachment] {
        selectedFolder == "All" ? sortedPhotos : sortedPhotos.filter { folderName(for: $0) == selectedFolder }
    }

    private var folderFilters: [String] {
        let usedFolders = Set(photos.map { folderName(for: $0) })
        var filters = ["All"]
        filters.append(contentsOf: PhotoFormViewModel.photoFolderOptions.filter { usedFolders.contains($0) })
        let extras = photos
            .map { folderName(for: $0) }
            .filter { !filters.contains($0) }
            .sorted()
        filters.append(contentsOf: extras)
        return filters
    }

    private var folderSections: [(name: String, photos: [PhotoAttachment])] {
        let grouped = Dictionary(grouping: sortedPhotos, by: folderName(for:))
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

    private func folderName(for photo: PhotoAttachment) -> String {
        let name = photo.phaseTag.trimmed
        return name.isEmpty ? "Uncategorized" : name
    }

    private func count(for folder: String) -> Int {
        folder == "All" ? photos.count : photos.filter { folderName(for: $0) == folder }.count
    }

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    photoHeader
                    libraryTabs

                    if libraryMode == .folders {
                        folderBar
                    }

                    if photos.isEmpty {
                        EmptyStateView(
                            title: "No photos",
                            subtitle: "Capture jobsite progress, receipts and finish details.",
                            systemImage: "camera"
                        )
                        .padding(.top, 80)
                    } else if libraryMode == .allPhotos {
                        photoGrid(sortedPhotos)
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
                .padding(.top, 8)
            }
            .background(AppTheme.pageBackground)
            .navigationTitle("Photos")
            .primaryFloatingAction(title: "Photo", systemImage: "camera.fill") {
                showingAddPhoto = true
            }
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Menu {
                        Button(newestFirst ? "Oldest First" : "Newest First") {
                            withAnimation(.smooth(duration: 0.2)) {
                                newestFirst.toggle()
                            }
                        }
                    } label: {
                        Image(systemName: "arrow.up.arrow.down")
                    }
                    .accessibilityLabel("Sort Photos")
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
            .fullScreenCover(item: $selectedPhoto) { photo in
                PhotoViewer(photo: photo)
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

    private var photoHeader: some View {
        PremiumCard {
            HStack(spacing: 14) {
                VStack(alignment: .leading, spacing: 6) {
                    Text("Jobsite Photo Log")
                        .font(.headline.weight(.semibold))

                    Text("\(photos.count) photos - \(folderCount) folders")
                        .font(.subheadline)
                        .foregroundStyle(.secondary)
                }
            }
        }
        .padding(.horizontal, AppTheme.pagePadding)
    }

    private var libraryTabs: some View {
        Picker("Photo View", selection: $libraryMode) {
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

    private func photoGrid(_ visiblePhotos: [PhotoAttachment]) -> some View {
        LazyVGrid(columns: columns, spacing: 12) {
            ForEach(visiblePhotos) { photo in
                PhotoGridTile(photo: photo)
                    .onTapGesture {
                        selectedPhoto = photo
                    }
                    .contextMenu {
                        Button {
                            photoIDToEdit = photo.id
                            showingEditPhoto = true
                        } label: {
                            Label("Edit", systemImage: "pencil")
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

    private func deletePhoto(withID photoID: UUID) {
        do {
            guard let photo = fetchPhoto(withID: photoID) else { return }
            modelContext.delete(photo)
            try modelContext.save()
        } catch {
            modelContext.rollback()
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
