import SwiftUI
import UIKit

/// The set of photos a viewer session is presenting, plus where in the set the user tapped.
/// Identifiable so `fullScreenCover(item:)` can drive presentation cleanly.
struct PhotoViewerContext: Identifiable {
    let id = UUID()
    let photos: [PhotoAttachment]
    let initialIndex: Int
    let linkedItemTitle: (PhotoAttachment) -> String?
}

struct PhotoViewer: View {
    let context: PhotoViewerContext
    let onEdit: (PhotoAttachment) -> Void
    let onDelete: (PhotoAttachment) -> Void

    @Environment(\.dismiss) private var dismiss
    @State private var currentIndex: Int
    @State private var dragOffset: CGFloat = 0
    @State private var showingDeleteConfirm = false
    @State private var isSharePresented = false

    init(
        context: PhotoViewerContext,
        onEdit: @escaping (PhotoAttachment) -> Void,
        onDelete: @escaping (PhotoAttachment) -> Void
    ) {
        self.context = context
        self.onEdit = onEdit
        self.onDelete = onDelete
        _currentIndex = State(initialValue: max(0, min(context.initialIndex, context.photos.count - 1)))
    }

    private var currentPhoto: PhotoAttachment? {
        guard !context.photos.isEmpty,
              context.photos.indices.contains(currentIndex)
        else { return nil }
        return context.photos[currentIndex]
    }

    var body: some View {
        ZStack {
            Color.black
                .ignoresSafeArea()
                .opacity(max(0, 1 - Double(abs(dragOffset)) / 400))

            // Swipeable, zoomable pager. PageTabViewStyle handles horizontal swipes; each tab is
            // a ZoomableImage that owns its own pinch+pan and absorbs gestures only when zoomed.
            TabView(selection: $currentIndex) {
                ForEach(context.photos.indices, id: \.self) { idx in
                    ZoomableImage(
                        data: context.photos[idx].imageData,
                        onDismissDrag: { translation in
                            dragOffset = translation
                        },
                        onDismissCommit: { translation in
                            if translation > 120 {
                                dismiss()
                            } else {
                                withAnimation(.spring()) { dragOffset = 0 }
                            }
                        }
                    )
                    .tag(idx)
                }
            }
            .tabViewStyle(.page(indexDisplayMode: .never))
            .offset(y: dragOffset)

            VStack {
                topBar
                Spacer()
                if let currentPhoto {
                    metadataOverlay(for: currentPhoto)
                }
            }
        }
        .statusBarHidden()
        .alert("Delete photo?", isPresented: $showingDeleteConfirm) {
            Button("Delete", role: .destructive) {
                if let photo = currentPhoto {
                    onDelete(photo)
                    dismiss()
                }
            }
            Button("Cancel", role: .cancel) {}
        } message: {
            Text("The photo file in your media mirror will also be removed. This can't be undone.")
        }
        .sheet(isPresented: $isSharePresented) {
            if let image = currentImage {
                ShareSheet(items: [image])
            }
        }
    }

    // MARK: - Top bar

    private var topBar: some View {
        HStack(spacing: 12) {
            iconButton(systemImage: "xmark", accessibilityLabel: "Close") {
                dismiss()
            }

            Spacer()

            if context.photos.count > 1 {
                Text("\(currentIndex + 1) of \(context.photos.count)")
                    .font(.footnote.weight(.bold))
                    .foregroundStyle(.white)
                    .padding(.horizontal, 12)
                    .padding(.vertical, 6)
                    .background(.black.opacity(0.48), in: Capsule())
            }

            Spacer()

            if currentImage != nil {
                iconButton(systemImage: "square.and.arrow.up", accessibilityLabel: "Share") {
                    isSharePresented = true
                }
            }

            actionsMenu
        }
        .padding(.horizontal, 16)
        .padding(.top, 12)
    }

    private var actionsMenu: some View {
        Menu {
            if let photo = currentPhoto {
                Button {
                    onEdit(photo)
                    dismiss()
                } label: {
                    Label("Edit details", systemImage: "pencil")
                }

                Button(role: .destructive) {
                    showingDeleteConfirm = true
                } label: {
                    Label("Delete photo", systemImage: "trash")
                }
            }
        } label: {
            Image(systemName: "ellipsis")
                .font(.headline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(.black.opacity(0.48), in: Circle())
        }
        .accessibilityLabel("Photo actions")
    }

    private func iconButton(systemImage: String, accessibilityLabel: String, action: @escaping () -> Void) -> some View {
        Button(action: action) {
            Image(systemName: systemImage)
                .font(.headline.weight(.bold))
                .foregroundStyle(.white)
                .frame(width: 44, height: 44)
                .background(.black.opacity(0.48), in: Circle())
        }
        .accessibilityLabel(accessibilityLabel)
    }

    // MARK: - Metadata overlay

    @ViewBuilder
    private func metadataOverlay(for photo: PhotoAttachment) -> some View {
        VStack(alignment: .leading, spacing: 8) {
            HStack {
                Text(photo.phaseTag.isEmpty ? "Photo" : photo.phaseTag)
                    .font(.headline.weight(.bold))
                Spacer()
                Text(photo.createdAt.shortDateString)
                    .font(.subheadline.weight(.semibold))
            }

            if !photo.roomTag.isEmpty {
                Label(photo.roomTag, systemImage: "mappin")
                    .font(.subheadline)
            }

            if let title = context.linkedItemTitle(photo), !title.isEmpty {
                Label(title, systemImage: "list.bullet.rectangle")
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.white.opacity(0.85))
            }

            if !photo.notes.isEmpty {
                Text(photo.notes)
                    .font(.subheadline)
                    .foregroundStyle(.white.opacity(0.78))
            }
        }
        .foregroundStyle(.white)
        .padding(16)
        .frame(maxWidth: .infinity, alignment: .leading)
        .background(.black.opacity(0.56), in: RoundedRectangle(cornerRadius: AppTheme.cardRadius, style: .continuous))
        .padding(.horizontal, 16)
        .padding(.bottom, 24)
    }

    // MARK: - Helpers

    private var currentImage: UIImage? {
        guard let data = currentPhoto?.imageData else { return nil }
        return UIImage(data: data)
    }
}

// MARK: - Zoomable image

/// Pan + pinch-zoom + double-tap-to-toggle. Falls through vertical drag to the parent when
/// the photo is at normal zoom so the swipe-down-to-dismiss gesture still works.
struct ZoomableImage: View {
    let data: Data?
    var onDismissDrag: (CGFloat) -> Void = { _ in }
    var onDismissCommit: (CGFloat) -> Void = { _ in }

    @State private var scale: CGFloat = 1
    @State private var lastCommittedScale: CGFloat = 1
    @State private var offset: CGSize = .zero
    @State private var lastCommittedOffset: CGSize = .zero
    @State private var verticalDrag: CGFloat = 0

    private let minScale: CGFloat = 1
    private let maxScale: CGFloat = 4

    var body: some View {
        GeometryReader { proxy in
            ZStack {
                if let data, let image = UIImage(data: data) {
                    Image(uiImage: image)
                        .resizable()
                        .scaledToFit()
                        .scaleEffect(scale)
                        .offset(offset)
                        .frame(width: proxy.size.width, height: proxy.size.height)
                        .gesture(magnification.simultaneously(with: panOrDismiss(in: proxy.size)))
                        .onTapGesture(count: 2) {
                            withAnimation(.smooth(duration: 0.2)) {
                                if scale > 1 {
                                    scale = 1
                                    lastCommittedScale = 1
                                    offset = .zero
                                    lastCommittedOffset = .zero
                                } else {
                                    scale = 2.5
                                    lastCommittedScale = 2.5
                                }
                            }
                        }
                } else {
                    PhotoThumbnail(data: nil, cornerRadius: 0)
                        .frame(width: proxy.size.width, height: proxy.size.height)
                }
            }
        }
    }

    private var magnification: some Gesture {
        MagnifyGesture()
            .onChanged { value in
                scale = clamp(lastCommittedScale * value.magnification, min: minScale, max: maxScale)
            }
            .onEnded { _ in
                lastCommittedScale = scale
                if scale <= minScale {
                    withAnimation(.smooth(duration: 0.2)) {
                        scale = 1
                        lastCommittedScale = 1
                        offset = .zero
                        lastCommittedOffset = .zero
                    }
                }
            }
    }

    private func panOrDismiss(in size: CGSize) -> some Gesture {
        DragGesture()
            .onChanged { value in
                if scale > 1 {
                    // Zoomed in → pan the image. Bound by the scaled extent.
                    let proposed = CGSize(
                        width: lastCommittedOffset.width + value.translation.width,
                        height: lastCommittedOffset.height + value.translation.height
                    )
                    offset = clamp(proposed, in: size, scale: scale)
                } else if value.translation.height > 0 {
                    // At normal zoom and dragging down → forward to parent for dismiss tracking.
                    verticalDrag = value.translation.height
                    onDismissDrag(verticalDrag)
                }
            }
            .onEnded { value in
                if scale > 1 {
                    lastCommittedOffset = offset
                } else {
                    onDismissCommit(value.translation.height)
                    verticalDrag = 0
                }
            }
    }

    private func clamp(_ v: CGFloat, min lower: CGFloat, max upper: CGFloat) -> CGFloat {
        Swift.min(Swift.max(v, lower), upper)
    }

    private func clamp(_ proposed: CGSize, in container: CGSize, scale: CGFloat) -> CGSize {
        // Allow panning up to half the over-extent in each axis.
        let maxX = (container.width * (scale - 1)) / 2
        let maxY = (container.height * (scale - 1)) / 2
        return CGSize(
            width: clamp(proposed.width, min: -maxX, max: maxX),
            height: clamp(proposed.height, min: -maxY, max: maxY)
        )
    }
}

// MARK: - Share sheet

private struct ShareSheet: UIViewControllerRepresentable {
    let items: [Any]

    func makeUIViewController(context: Context) -> UIActivityViewController {
        UIActivityViewController(activityItems: items, applicationActivities: nil)
    }

    func updateUIViewController(_ controller: UIActivityViewController, context: Context) {}
}
