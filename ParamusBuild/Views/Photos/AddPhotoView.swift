import PhotosUI
import SwiftData
import SwiftUI

struct AddPhotoView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let project: Project
    let photoID: UUID?

    @Query private var items: [BudgetLineItem]

    @StateObject private var viewModel: PhotoFormViewModel
    @State private var selectedPhotoItem: PhotosPickerItem?
    @State private var showingCamera = false

    init(project: Project, photo: PhotoAttachment? = nil) {
        self.project = project
        photoID = photo?.id
        let projectID = project.id
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _viewModel = StateObject(
            wrappedValue: PhotoFormViewModel(
                imageData: photo?.imageData,
                roomTag: photo?.roomTag ?? "",
                phaseTag: photo?.phaseTag ?? PhotoFormViewModel.defaultFolder,
                notes: photo?.notes ?? "",
                budgetLineItemID: photo?.budgetLineItemID
            )
        )
    }

    private var selectedItem: BudgetLineItem? {
        guard let id = viewModel.budgetLineItemID else { return nil }
        return items.first { $0.id == id }
    }

    var body: some View {
        NavigationStack {
            ModernForm {
                ModernFormSection("Photo") {
                    if viewModel.imageData != nil {
                        PhotoThumbnail(data: viewModel.imageData)
                            .frame(height: 260)
                            .padding(.vertical, 4)
                    } else {
                        ZStack {
                            RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous)
                                .fill(AppTheme.cardBackground)

                            VStack(spacing: 10) {
                                Image(systemName: "camera.viewfinder")
                                    .font(.system(size: 42, weight: .semibold))
                                    .foregroundStyle(AppTheme.accent)
                                Text("Add jobsite photo")
                                    .font(.headline)
                            }
                        }
                        .frame(height: 220)
                    }

                    HStack(spacing: 12) {
                        PhotosPicker(selection: $selectedPhotoItem, matching: .images) {
                            Label("Library", systemImage: "photo")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.bordered)

                        Button {
                            showingCamera = true
                        } label: {
                            Label("Camera", systemImage: "camera")
                                .frame(maxWidth: .infinity)
                        }
                        .buttonStyle(.borderedProminent)
                    }
                }

                ModernFormSection("Tags") {
                    ModernField("Room or area") {
                        TextField("e.g. Kitchen, rear yard, basement", text: $viewModel.roomTag)
                            .textInputAutocapitalization(.words)
                            .modernTextField()
                    }

                    ModernField("Folder") {
                        Picker("Folder", selection: $viewModel.phaseTag) {
                            ForEach(viewModel.phaseOptions, id: \.self) { phase in
                                Text(phase).tag(phase)
                            }
                        }
                        .pickerStyle(.menu)
                    }

                    ModernField("Budget item", subtitle: "Optional link for context and export.") {
                        Picker("Budget item", selection: $viewModel.budgetLineItemID) {
                            Text("None").tag(UUID?.none)
                            ForEach(items) { item in
                                Text("\(item.costCode)  \(item.title)")
                                    .tag(Optional(item.id))
                            }
                        }
                        .pickerStyle(.menu)
                    }
                }

                ModernFormSection("Notes") {
                    ModernField("Notes") {
                        TextField("Optional details", text: $viewModel.notes, axis: .vertical)
                            .lineLimit(3 ... 6)
                            .modernTextField()
                    }
                }
            }
            .navigationTitle(photoID == nil ? "Add Photo" : "Edit Photo")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) {
                    Button("Cancel") {
                        dismiss()
                    }
                }

                ToolbarItem(placement: .confirmationAction) {
                    Button(photoID == nil ? "Save" : "Update") {
                        save()
                    }
                    .disabled(!viewModel.canSave)
                }
            }
            .onChange(of: selectedPhotoItem) { _, newItem in
                Task {
                    guard let data = try? await newItem?.loadTransferable(type: Data.self) else { return }
                    let optimized = ImageDataProcessor.optimizedJPEGData(from: data, maxDimension: 1800, compressionQuality: 0.84)
                    await MainActor.run {
                        viewModel.imageData = optimized ?? data
                    }
                }
            }
            .sheet(isPresented: $showingCamera) {
                CameraPicker { image in
                    viewModel.imageData = ImageDataProcessor.optimizedJPEGData(from: image, maxDimension: 1800, compressionQuality: 0.84)
                }
            }
        }
    }

    private func save() {
        do {
            if let photoID {
                guard let photoToEdit = fetchPhoto(withID: photoID) else {
                    Haptics.warning()
                    return
                }
                applyViewModel(to: photoToEdit)
            } else {
                modelContext.insert(makePhoto())
            }

            try modelContext.save()
            Haptics.success()
            dismiss()
        } catch {
            modelContext.rollback()
            Haptics.warning()
        }
    }

    private func makePhoto() -> PhotoAttachment {
        PhotoAttachment(
            projectID: project.id,
            imageData: viewModel.imageData,
            createdAt: .now,
            roomTag: viewModel.roomTag.trimmed,
            phaseTag: viewModel.phaseTag,
            categoryName: selectedItem?.categoryName ?? "",
            budgetLineItemID: selectedItem?.id,
            notes: viewModel.notes.trimmed
        )
    }

    private func applyViewModel(to photo: PhotoAttachment) {
        photo.imageData = viewModel.imageData
        photo.roomTag = viewModel.roomTag.trimmed
        photo.phaseTag = viewModel.phaseTag
        if let selectedItem {
            photo.categoryName = selectedItem.categoryName
            photo.budgetLineItemID = selectedItem.id
        } else {
            photo.budgetLineItemID = nil
        }
        photo.notes = viewModel.notes.trimmed
    }

    private func fetchPhoto(withID photoID: UUID) -> PhotoAttachment? {
        let projectID = project.id
        let descriptor = FetchDescriptor<PhotoAttachment>(
            predicate: #Predicate { $0.id == photoID && $0.projectID == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }
}
