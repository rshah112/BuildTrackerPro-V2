import SwiftData
import SwiftUI

struct ProjectInfoView: View {
    @Environment(\.dismiss) private var dismiss
    @Environment(\.modelContext) private var modelContext

    let projectID: UUID

    @Query private var items: [BudgetLineItem]

    @State private var name: String
    @State private var address: String
    @State private var status: ProjectStatus
    @State private var priority: ProjectPriority
    @State private var hasStartDate: Bool
    @State private var startDate: Date
    @State private var hasTargetFinishDate: Bool
    @State private var targetFinishDate: Date
    @State private var scopeSummary: String
    @State private var warrantyNotes: String
    @State private var purchasePrice: Double
    @State private var lotDimensions: String
    @State private var proposedBuildDimensions: String
    @State private var footprint: String
    @State private var stories: Int
    @State private var basement: String
    @State private var constructionBudget: Double
    @State private var contingencyBudget: Double
    @State private var saveErrorMessage: String?

    init(project: Project) {
        projectID = project.id
        let projectID = project.id
        _items = Query(filter: #Predicate<BudgetLineItem> { $0.projectID == projectID }, sort: \.costCode)
        _name = State(initialValue: project.name)
        _address = State(initialValue: project.address)
        _status = State(initialValue: project.status)
        _priority = State(initialValue: project.priority)
        _hasStartDate = State(initialValue: project.startDate != nil)
        _startDate = State(initialValue: project.startDate ?? .now)
        _hasTargetFinishDate = State(initialValue: project.targetFinishDate != nil)
        _targetFinishDate = State(initialValue: project.targetFinishDate ?? .now)
        _scopeSummary = State(initialValue: project.scopeSummary)
        _warrantyNotes = State(initialValue: project.warrantyNotes)
        _purchasePrice = State(initialValue: project.purchasePrice)
        _lotDimensions = State(initialValue: project.lotDimensions)
        _proposedBuildDimensions = State(initialValue: project.proposedBuildDimensions)
        _footprint = State(initialValue: project.footprint)
        _stories = State(initialValue: project.stories)
        _basement = State(initialValue: project.basement)
        _constructionBudget = State(initialValue: project.constructionBudget)
        _contingencyBudget = State(initialValue: project.contingencyBudget)
    }

    private var lineItemBudget: Double {
        items.filter { $0.categoryName != "Contingency" }.reduce(0) { $0 + $1.budget }
    }

    var body: some View {
        ModernForm {
            ModernFormSection("Project") {
                ModernField("Name") {
                    TextField("Project name", text: $name)
                        .modernTextField()
                }

                ModernField("Address") {
                    TextField("Street, city, state", text: $address, axis: .vertical)
                        .lineLimit(2 ... 4)
                        .modernTextField()
                }
            }

            ModernFormSection("Status & Timeline") {
                ModernField("Status") {
                    Picker("Status", selection: $status) {
                        ForEach(ProjectStatus.allCases) { status in
                            Label(status.title, systemImage: status.systemImage).tag(status)
                        }
                    }
                    .pickerStyle(.menu)
                }

                ModernField("Priority") {
                    Picker("Priority", selection: $priority) {
                        ForEach(ProjectPriority.allCases) { priority in
                            Text(priority.title).tag(priority)
                        }
                    }
                    .pickerStyle(.segmented)
                }

                Toggle("Start date", isOn: $hasStartDate)
                    .font(.body.weight(.medium))

                if hasStartDate {
                    ModernField("Starts") {
                        DatePicker("Starts", selection: $startDate, displayedComponents: .date)
                            .labelsHidden()
                    }
                }

                Toggle("Target finish", isOn: $hasTargetFinishDate)
                    .font(.body.weight(.medium))

                if hasTargetFinishDate {
                    ModernField("Finish target") {
                        DatePicker("Finish target", selection: $targetFinishDate, displayedComponents: .date)
                            .labelsHidden()
                    }
                }
            }

            ModernFormSection("Scope & Follow-Up") {
                ModernField("Scope summary") {
                    TextField("What is included in this project", text: $scopeSummary, axis: .vertical)
                        .lineLimit(3 ... 6)
                        .modernTextField()
                }

                ModernField("Warranty / follow-up notes") {
                    TextField("Open follow-ups after completion", text: $warrantyNotes, axis: .vertical)
                        .lineLimit(3 ... 6)
                        .modernTextField()
                }
            }

            ModernFormSection("Baseline") {
                ModernField("Purchase price") {
                    CurrencyField(value: $purchasePrice)
                        .modernTextField()
                }

                ModernField("Lot dimensions") {
                    TextField("e.g. 70 x 125", text: $lotDimensions)
                        .modernTextField()
                }

                ModernField("Proposed build dimensions") {
                    TextField("Dimensions, square footage, or scope", text: $proposedBuildDimensions)
                        .modernTextField()
                }

                ModernField("Stories") {
                    Stepper("\(stories)", value: $stories, in: 1 ... 4)
                        .font(.body.weight(.semibold))
                }

                ModernField("Basement") {
                    TextField("Current or proposed condition", text: $basement)
                        .modernTextField()
                }
            }

            ModernFormSection("Budget") {
                ModernField("Project budget", subtitle: "The base budget for the planned scope of work.") {
                    CurrencyField(value: $constructionBudget)
                        .modernTextField()
                }

                ModernField("Reserve / contingency", subtitle: "Optional backup money outside the base budget.") {
                    CurrencyField(value: $contingencyBudget)
                        .modernTextField()
                }

                LabeledContent("Total Envelope", value: (constructionBudget + contingencyBudget).currencyString)
                LabeledContent("Line Item Total", value: lineItemBudget.currencyString)

                if abs(lineItemBudget - constructionBudget) > 1 {
                    Button("Use Line Item Total") {
                        constructionBudget = lineItemBudget
                        Haptics.lightTap()
                    }
                }
            }
        }
        .navigationTitle("Project Info")
        .toolbar {
            ToolbarItem(placement: .confirmationAction) {
                Button("Save") {
                    save()
                }
                .disabled(name.trimmed.isEmpty)
            }
        }
        .alert("Project Could Not Be Saved", isPresented: saveErrorBinding) {
            Button("OK", role: .cancel) {}
        } message: {
            Text(saveErrorMessage ?? "Please try again.")
        }
    }

    private var saveErrorBinding: Binding<Bool> {
        Binding(
            get: { saveErrorMessage != nil },
            set: { isPresented in
                if !isPresented {
                    saveErrorMessage = nil
                }
            }
        )
    }

    private func save() {
        guard let project = fetchProject() else {
            saveErrorMessage = "This project no longer exists."
            Haptics.warning()
            return
        }

        project.name = name.trimmed
        project.address = address.trimmed
        project.status = status
        project.priority = priority
        project.startDate = hasStartDate ? startDate : nil
        project.targetFinishDate = hasTargetFinishDate ? targetFinishDate : nil
        project.scopeSummary = scopeSummary.trimmed
        project.warrantyNotes = warrantyNotes.trimmed
        project.purchasePrice = max(0, purchasePrice)
        project.lotDimensions = lotDimensions.trimmed
        project.proposedBuildDimensions = proposedBuildDimensions.trimmed
        project.footprint = proposedBuildDimensions.trimmed.isEmpty ? footprint.trimmed : proposedBuildDimensions.trimmed
        project.stories = stories
        project.basement = basement.trimmed
        project.constructionBudget = max(0, constructionBudget)
        project.contingencyBudget = max(0, contingencyBudget)

        do {
            try modelContext.save()
            Haptics.success()
            dismiss()
        } catch {
            modelContext.rollback()
            saveErrorMessage = error.localizedDescription
            Haptics.warning()
        }
    }

    private func fetchProject() -> Project? {
        let descriptor = FetchDescriptor<Project>(
            predicate: #Predicate { $0.id == projectID }
        )
        return try? modelContext.fetch(descriptor).first
    }
}
