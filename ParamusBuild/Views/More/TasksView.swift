import SwiftData
import SwiftUI

struct TasksView: View {
    @Environment(\.modelContext) private var modelContext
    let project: Project

    @Query private var tasks: [ProjectTask]
    @Query private var vendors: [Vendor]
    @Query private var items: [BudgetLineItem]
    @Query private var photos: [PhotoAttachment]

    @State private var showingAddTask = false
    @State private var showingWalkthrough = false
    @State private var taskToEdit: ProjectTask?
    @State private var taskError: String?

    init(project: Project) {
        self.project = project
        let projectID = project.id
        _tasks = Query(filter: #Predicate<ProjectTask> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
        _vendors = Query(filter: #Predicate<Vendor> { $0.projectID == projectID }, sort: \.name)
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _photos = Query(filter: #Predicate<PhotoAttachment> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
    }

    private var openTasks: [ProjectTask] {
        tasks.filter { $0.status != .done }
    }

    private var doneTasks: [ProjectTask] {
        tasks.filter { $0.status == .done }
    }

    private var overdueTasks: [ProjectTask] {
        openTasks.filter(\.isOverdue)
    }

    var body: some View {
        List {
            Section {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Punch List")
                        .font(.title3.weight(.bold))
                    Text("\(openTasks.count) open - \(overdueTasks.count) overdue")
                        .font(.subheadline)
                        .foregroundStyle(overdueTasks.isEmpty ? .secondary : AppTheme.negative)
                }
                .padding(.vertical, 8)
            }

            if tasks.isEmpty {
                Section {
                    EmptyStateView(
                        title: "No tasks yet",
                        subtitle: "Add punch list items during walkthroughs or from photos.",
                        systemImage: "checklist"
                    )
                    .padding(.vertical, 32)
                }
            }

            if !openTasks.isEmpty {
                Section("Open") {
                    ForEach(openTasks) { task in
                        taskRow(task)
                    }
                }
            }

            if !doneTasks.isEmpty {
                Section("Done") {
                    ForEach(doneTasks) { task in
                        taskRow(task)
                    }
                }
            }
        }
        .listStyle(.insetGrouped)
        .scrollContentBackground(.hidden)
        .background(AppTheme.pageBackground)
        .navigationTitle("Tasks")
        .toolbar {
            ToolbarItem(placement: .topBarTrailing) {
                Menu {
                    Button { showingAddTask = true } label: { Label("Add Task", systemImage: "plus") }
                    Button { showingWalkthrough = true } label: { Label("Walkthrough Mode", systemImage: "figure.walk") }
                } label: {
                    Image(systemName: "plus.circle.fill")
                }
                .accessibilityLabel("Add Task")
            }
        }
        .primaryFloatingAction(title: "Task", systemImage: "plus") { showingAddTask = true }
        .sheet(isPresented: $showingAddTask) { AddTaskView(project: project) }
        .sheet(item: $taskToEdit) { task in AddTaskView(project: project, task: task) }
        .fullScreenCover(isPresented: $showingWalkthrough) { TaskWalkthroughView(project: project) }
        .alert("Task Error", isPresented: taskErrorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(taskError ?? "")
        }
    }

    private var taskErrorBinding: Binding<Bool> {
        Binding(
            get: { taskError != nil },
            set: { isPresented in if !isPresented { taskError = nil } }
        )
    }

    private func taskRow(_ task: ProjectTask) -> some View {
        HStack(spacing: 12) {
            Button { cycleStatus(for: task) } label: {
                Image(systemName: task.status.systemImage)
                    .font(.title3.weight(.semibold))
                    .foregroundStyle(task.status == .done ? AppTheme.positive : task.isOverdue ? AppTheme.negative : AppTheme.accent)
                    .frame(width: 34, height: 34)
            }
            .buttonStyle(.plain)

            Button { taskToEdit = task } label: {
                VStack(alignment: .leading, spacing: 4) {
                    HStack(spacing: 6) {
                        Text(task.title)
                            .font(.subheadline.weight(.semibold))
                            .foregroundStyle(.primary)
                        if task.isOverdue {
                            Text("Overdue")
                                .font(.caption2.weight(.bold))
                                .foregroundStyle(.white)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 3)
                                .background(AppTheme.negative, in: Capsule())
                        }
                    }
                    Text(taskSubtitle(task))
                        .font(.caption)
                        .foregroundStyle(.secondary)
                        .lineLimit(2)
                }
                .frame(maxWidth: .infinity, alignment: .leading)
            }
            .buttonStyle(.plain)
        }
        .swipeActions(edge: .trailing, allowsFullSwipe: true) {
            Button(role: .destructive) { delete(task) } label: { Label("Delete", systemImage: "trash") }
        }
    }

    private func taskSubtitle(_ task: ProjectTask) -> String {
        var parts: [String] = [task.status.title]
        if let dueDate = task.dueDate { parts.append("Due \(dueDate.shortDateString)") }
        if let vendorID = task.vendorID, let vendor = vendors.first(where: { $0.id == vendorID }) { parts.append(vendor.name) }
        if !task.photoIDs.isEmpty { parts.append("\(task.photoIDs.count) photo\(task.photoIDs.count == 1 ? "" : "s")") }
        return parts.joined(separator: " - ")
    }

    private func cycleStatus(for task: ProjectTask) {
        switch task.status {
        case .todo: task.status = .inProgress
        case .inProgress, .blocked: task.status = .done
        case .done: task.status = .todo
        }
        saveChanges()
    }

    private func delete(_ task: ProjectTask) {
        modelContext.delete(task)
        saveChanges()
    }

    private func saveChanges() {
        do {
            try modelContext.save()
            Haptics.lightTap()
        } catch {
            modelContext.safeRollback()
            taskError = error.localizedDescription
            Haptics.warning()
        }
    }
}

struct AddTaskView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let project: Project
    let task: ProjectTask?
    let seedPhotoID: UUID?

    @Query private var vendors: [Vendor]
    @Query private var items: [BudgetLineItem]
    @Query private var photos: [PhotoAttachment]

    @State private var title: String
    @State private var status: ProjectTaskStatus
    @State private var hasDueDate: Bool
    @State private var dueDate: Date
    @State private var vendorID: UUID?
    @State private var budgetLineItemID: UUID?
    @State private var selectedPhotoIDs: Set<UUID>
    @State private var notes: String
    @State private var saveError: String?

    init(project: Project, task: ProjectTask? = nil, seedPhotoID: UUID? = nil) {
        self.project = project
        self.task = task
        self.seedPhotoID = seedPhotoID
        let projectID = project.id
        _vendors = Query(filter: #Predicate<Vendor> { $0.projectID == projectID }, sort: \.name)
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _photos = Query(filter: #Predicate<PhotoAttachment> { $0.projectID == projectID }, sort: \.createdAt, order: .reverse)
        _title = State(initialValue: task?.title ?? "")
        _status = State(initialValue: task?.status ?? .todo)
        _hasDueDate = State(initialValue: task?.dueDate != nil)
        _dueDate = State(initialValue: task?.dueDate ?? .now)
        _vendorID = State(initialValue: task?.vendorID)
        _budgetLineItemID = State(initialValue: task?.budgetLineItemID)
        _selectedPhotoIDs = State(initialValue: Set(task?.photoIDs ?? seedPhotoID.map { [$0] } ?? []))
        _notes = State(initialValue: task?.notes ?? "")
    }

    private var canSave: Bool {
        !title.trimmed.isEmpty
    }

    var body: some View {
        NavigationStack {
            ModernForm {
                ModernFormSection("Task") {
                    ModernField("Title") {
                        TextField("e.g. Touch up stair rail paint", text: $title)
                            .textInputAutocapitalization(.sentences)
                            .submitLabel(.done)
                            .modernTextField()
                    }
                    Picker("Status", selection: $status) {
                        ForEach(ProjectTaskStatus.allCases) { status in
                            Label(status.title, systemImage: status.systemImage).tag(status)
                        }
                    }
                    Toggle("Due date", isOn: $hasDueDate)
                    if hasDueDate { DatePicker("Due", selection: $dueDate, displayedComponents: .date) }
                }

                ModernFormSection("Links") {
                    Picker("Vendor", selection: $vendorID) {
                        Text("None").tag(UUID?.none)
                        ForEach(vendors) { vendor in Text(vendor.name).tag(Optional(vendor.id)) }
                    }
                    Picker("Budget item", selection: $budgetLineItemID) {
                        Text("None").tag(UUID?.none)
                        ForEach(items) { item in Text("\(item.costCode) - \(item.title)").tag(Optional(item.id)) }
                    }
                }

                ModernFormSection("Photos") {
                    if photos.isEmpty {
                        Text("No project photos yet").foregroundStyle(.secondary)
                    } else {
                        ScrollView(.horizontal, showsIndicators: false) {
                            HStack(spacing: 10) {
                                ForEach(photos.prefix(20)) { photo in
                                    Button { togglePhoto(photo.id) } label: {
                                        PhotoThumbnail(data: photo.imageData, cornerRadius: 8)
                                            .frame(width: 86, height: 86)
                                            .overlay(alignment: .topTrailing) {
                                                if selectedPhotoIDs.contains(photo.id) {
                                                    Image(systemName: "checkmark.circle.fill")
                                                        .font(.title3)
                                                        .foregroundStyle(AppTheme.positive)
                                                        .background(.white, in: Circle())
                                                        .padding(5)
                                                }
                                            }
                                    }
                                    .buttonStyle(.plain)
                                }
                            }
                            .padding(.vertical, 4)
                        }
                    }
                }

                ModernFormSection("Notes") {
                    ModernField("Notes") {
                        TextField("Optional details", text: $notes, axis: .vertical)
                            .lineLimit(3 ... 6)
                            .modernTextField()
                    }
                }
            }
            .navigationTitle(task == nil ? "Add Task" : "Edit Task")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Cancel") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Save") { save() }.disabled(!canSave) }
            }
            .alert("Task Could Not Be Saved", isPresented: saveErrorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(saveError ?? "Please try again.")
            }
        }
    }

    private var saveErrorBinding: Binding<Bool> {
        Binding(get: { saveError != nil }, set: { isPresented in if !isPresented { saveError = nil } })
    }

    private func togglePhoto(_ id: UUID) {
        if selectedPhotoIDs.contains(id) { selectedPhotoIDs.remove(id) } else { selectedPhotoIDs.insert(id) }
    }

    private func save() {
        let effectiveDueDate = hasDueDate ? dueDate : nil
        if let task {
            task.title = title.trimmed
            task.status = status
            task.dueDate = effectiveDueDate
            task.vendorID = vendorID
            task.budgetLineItemID = budgetLineItemID
            task.photoIDs = Array(selectedPhotoIDs)
            task.notes = notes.trimmed
        } else {
            modelContext.insert(ProjectTask(
                projectID: project.id,
                title: title.trimmed,
                status: status,
                dueDate: effectiveDueDate,
                vendorID: vendorID,
                budgetLineItemID: budgetLineItemID,
                photoIDs: Array(selectedPhotoIDs),
                notes: notes.trimmed
            ))
        }
        do {
            try modelContext.save()
            Haptics.success()
            dismiss()
        } catch {
            modelContext.safeRollback()
            saveError = error.localizedDescription
            Haptics.warning()
        }
    }
}

private struct TaskWalkthroughView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext
    let project: Project

    @State private var title = ""
    @State private var addedCount = 0
    @State private var errorMessage: String?

    var body: some View {
        NavigationStack {
            VStack(alignment: .leading, spacing: 18) {
                VStack(alignment: .leading, spacing: 8) {
                    Text("Walkthrough Mode").font(AppFont.largeTitle)
                    Text("\(addedCount) task\(addedCount == 1 ? "" : "s") added")
                        .font(AppFont.subheadline)
                        .foregroundStyle(.secondary)
                }
                TextField("Type punch item, press Return", text: $title)
                    .textInputAutocapitalization(.sentences)
                    .submitLabel(.next)
                    .modernTextField()
                    .font(.title3.weight(.semibold))
                    .onSubmit(addCurrentTask)
                Text("Keep walking the project. Each Return saves the item and clears the field.")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)
                Spacer()
            }
            .padding(AppTheme.pagePadding)
            .background(AppTheme.pageBackground)
            .navigationTitle("Punch Walk")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .cancellationAction) { Button("Done") { dismiss() } }
                ToolbarItem(placement: .confirmationAction) { Button("Add") { addCurrentTask() }.disabled(title.trimmed.isEmpty) }
            }
            .alert("Task Could Not Be Added", isPresented: errorBinding) {
                Button("OK", role: .cancel) {}
            } message: {
                Text(errorMessage ?? "Please try again.")
            }
        }
    }

    private var errorBinding: Binding<Bool> {
        Binding(get: { errorMessage != nil }, set: { isPresented in if !isPresented { errorMessage = nil } })
    }

    private func addCurrentTask() {
        let trimmed = title.trimmed
        guard !trimmed.isEmpty else { return }
        modelContext.insert(ProjectTask(projectID: project.id, title: trimmed))
        do {
            try modelContext.save()
            title = ""
            addedCount += 1
            Haptics.lightTap()
        } catch {
            modelContext.safeRollback()
            errorMessage = error.localizedDescription
            Haptics.warning()
        }
    }
}
