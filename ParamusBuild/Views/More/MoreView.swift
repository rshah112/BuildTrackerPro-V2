import SwiftData
import SwiftUI

struct MoreView: View {
    @Environment(\.modelContext) private var modelContext

    let project: Project
    let closeProject: () -> Void
    let deleteProject: (UUID) -> Void

    @State private var showingDeleteAlert = false
    @State private var documentCount = 0
    @State private var photoCount = 0
    @State private var taskCount = 0

    init(project: Project, closeProject: @escaping () -> Void, deleteProject: @escaping (UUID) -> Void) {
        self.project = project
        self.closeProject = closeProject
        self.deleteProject = deleteProject
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    VStack(alignment: .leading, spacing: 10) {
                        Text(project.name)
                            .font(.title3.weight(.bold))
                        Text(project.address)
                            .font(.subheadline)
                            .foregroundStyle(.secondary)
                        HStack(spacing: 7) {
                            Label(project.status.title, systemImage: project.status.systemImage)
                                .foregroundStyle(AppTheme.projectStatusColor(project.status))
                            Label(project.priority.title, systemImage: "flag.fill")
                                .foregroundStyle(AppTheme.projectPriorityColor(project.priority))
                        }
                        .font(.caption.weight(.bold))
                        HStack {
                            Label(project.lotDimensions.isEmpty ? "Lot TBD" : project.lotDimensions, systemImage: "map")
                            Spacer()
                            Label(
                                project.proposedBuildDimensions.isEmpty ? project.footprint : project.proposedBuildDimensions,
                                systemImage: "ruler"
                            )
                        }
                        .font(.caption.weight(.semibold))
                        .foregroundStyle(.secondary)
                    }
                    .padding(.vertical, 6)
                }

                Section("Project") {
                    Button {
                        closeProject()
                    } label: {
                        MoreRow(title: "All Projects", subtitle: "Switch or create projects", systemImage: "rectangle.stack")
                    }
                    .foregroundStyle(.primary)

                    NavigationLink {
                        ProjectInfoView(project: project)
                    } label: {
                        MoreRow(title: "Project Info", subtitle: "Status, timeline, scope and baseline details", systemImage: "info.circle")
                    }

                    Button {
                        toggleProjectCompletion()
                    } label: {
                        MoreRow(
                            title: project.status == .complete ? "Reopen Project" : "Mark Complete",
                            subtitle: project
                                .status == .complete ? "Move this project back to active tracking" :
                                "Close the project and keep warranty notes",
                            systemImage: project.status == .complete ? "arrow.uturn.backward.circle" : "checkmark.seal"
                        )
                    }
                    .foregroundStyle(.primary)

                    NavigationLink {
                        DocumentsView(project: project)
                    } label: {
                        MoreRow(title: "Documents", subtitle: "\(documentCount) surveys, permits and plan files", systemImage: "folder")
                    }

                    NavigationLink {
                        ExportProjectView(project: project)
                    } label: {
                        MoreRow(
                            title: "Export / Import",
                            subtitle: "Timestamped ZIPs and editable workbook sync",
                            systemImage: "square.and.arrow.up"
                        )
                    }
                }

                Section("Manage") {
                    NavigationLink {
                        VendorsView(project: project)
                    } label: {
                        MoreRow(title: "Vendors", subtitle: "Trades and contacts", systemImage: "person.2")
                    }

                    NavigationLink {
                        ChangeOrdersView(project: project)
                    } label: {
                        MoreRow(title: "Change Orders", subtitle: "Pending, approved and paid", systemImage: "arrow.triangle.2.circlepath")
                    }

                    NavigationLink {
                        TasksView(project: project)
                    } label: {
                        MoreRow(title: "Tasks", subtitle: "\(taskCount) punch list items", systemImage: "checklist")
                    }

                    NavigationLink {
                        RoomSummaryView(project: project)
                    } label: {
                        MoreRow(title: "By Room", subtitle: "Budget, expenses and photos by area", systemImage: "square.grid.2x2")
                    }

                    NavigationLink {
                        SettingsView()
                    } label: {
                        MoreRow(title: "Settings", subtitle: "Display and jobsite preferences", systemImage: "gearshape")
                    }
                }

                Section {
                    HStack {
                        Label("\(photoCount) photos", systemImage: "photo")
                        Spacer()
                        Label("\(documentCount) documents", systemImage: "doc")
                        Spacer()
                        Label("\(taskCount) tasks", systemImage: "checklist")
                    }
                    .font(.caption.weight(.semibold))
                    .foregroundStyle(.secondary)
                }

                Section {
                    Button(role: .destructive) {
                        showingDeleteAlert = true
                    } label: {
                        MoreRow(title: "Delete Project", subtitle: "Remove this build and all related data", systemImage: "trash")
                    }
                }
            }
            .listStyle(.insetGrouped)
            .scrollContentBackground(.hidden)
            .background(AppTheme.pageBackground)
            .navigationTitle("More")
            .onAppear {
                refreshCounts()
            }
            .alert("Delete Project?", isPresented: $showingDeleteAlert) {
                Button("Delete", role: .destructive) {
                    requestProjectDelete()
                }
                Button("Cancel", role: .cancel) {}
            } message: {
                Text(
                    "This permanently removes \(project.name), including its budget, expenses, photos, documents, vendors and change orders."
                )
            }
        }
    }

    private func requestProjectDelete() {
        let projectID = project.id
        deleteProject(projectID)
    }

    private func toggleProjectCompletion() {
        project.status = project.status == .complete ? .active : .complete
        do {
            try modelContext.save()
            Haptics.success()
        } catch {
            modelContext.safeRollback()
            Haptics.warning()
        }
    }

    private func refreshCounts() {
        documentCount = fetchDocumentCount()
        photoCount = fetchPhotoCount()
        taskCount = fetchTaskCount()
    }

    private func fetchDocumentCount() -> Int {
        let projectID = project.id
        let descriptor = FetchDescriptor<ProjectDocument>(
            predicate: #Predicate { $0.projectID == projectID }
        )
        return ((try? modelContext.fetch(descriptor)) ?? []).count
    }

    private func fetchPhotoCount() -> Int {
        let projectID = project.id
        let descriptor = FetchDescriptor<PhotoAttachment>(
            predicate: #Predicate { $0.projectID == projectID }
        )
        return ((try? modelContext.fetch(descriptor)) ?? []).count
    }

    private func fetchTaskCount() -> Int {
        let projectID = project.id
        let descriptor = FetchDescriptor<ProjectTask>(
            predicate: #Predicate { $0.projectID == projectID }
        )
        return ((try? modelContext.fetch(descriptor)) ?? []).count
    }
}

struct MoreRow: View {
    let title: String
    let subtitle: String
    let systemImage: String

    var body: some View {
        HStack(spacing: 12) {
            Image(systemName: systemImage)
                .font(.headline.weight(.semibold))
                .foregroundStyle(AppTheme.accent)
                .frame(width: 36, height: 36)
                .background(AppTheme.accent.opacity(0.13), in: RoundedRectangle(cornerRadius: 8, style: .continuous))

            VStack(alignment: .leading, spacing: 3) {
                Text(title)
                    .font(.subheadline.weight(.semibold))
                Text(subtitle)
                    .font(.caption)
                    .foregroundStyle(.secondary)
            }
        }
        .padding(.vertical, 5)
    }
}
