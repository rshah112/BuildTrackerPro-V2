import type { ProjectTemplateType } from './enums'

// Port of ParamusBuild/Data/RoomCatalog.swift (room lists per template type).

export const GENERAL_ROOM = 'General'

export function roomsForTemplate(t: ProjectTemplateType): string[] {
  switch (t) {
    case 'customHome':
    case 'majorRenovation':
    case 'addition':
      return [GENERAL_ROOM, 'Kitchen', 'Dining', 'Living Room', 'Primary Suite', 'Bedroom', 'Bathroom', 'Basement', 'Garage', 'Exterior', 'Site']
    case 'poolBackyard':
      return [GENERAL_ROOM, 'Pool', 'Patio', 'Outdoor Kitchen', 'Equipment', 'Landscape', 'Site']
    case 'deckPatio':
      return [GENERAL_ROOM, 'Deck', 'Patio', 'Stairs & Railings', 'Hardscape', 'Landscape', 'Site']
    case 'kitchenRemodel':
      return [GENERAL_ROOM, 'Kitchen', 'Dining', 'Pantry']
    case 'bathroomRemodel':
      return [GENERAL_ROOM, 'Bathroom', 'Primary Bath', 'Powder Room']
    case 'basementFinish':
      return [GENERAL_ROOM, 'Basement', 'Bathroom', 'Utility']
    case 'garageBuild':
      return [GENERAL_ROOM, 'Garage', 'Driveway', 'Exterior', 'Site']
    case 'landscapingHardscape':
      return [GENERAL_ROOM, 'Front Yard', 'Backyard', 'Patio', 'Driveway', 'Planting', 'Site']
    case 'custom':
    default:
      return [GENERAL_ROOM]
  }
}

export const PHASE_TAGS = ['Pre-construction', 'Demolition', 'Foundation', 'Framing', 'Rough-in', 'Insulation', 'Drywall', 'Finishes', 'Punch list', 'Complete']
