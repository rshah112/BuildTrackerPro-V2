// Industry-standard budget templates ported from the native ProjectTemplateService.
// Each template's category `percent` is its share of the construction budget (sums to 100);
// each line item's `share` is normalized WITHIN its category. Used to pre-populate a new
// project's budget categories + line items from the chosen template type and budget amount.
// Generated from ParamusBuild/Data/ProjectTemplateService.swift — do not hand-edit the data.
import type { ProjectTemplateType } from './enums'

export interface TemplateItem {
  title: string
  share: number
  notes?: string
}
export interface TemplateCategoryDef {
  name: string
  percent: number
  items: TemplateItem[]
}

export const PROJECT_TEMPLATES: Partial<Record<ProjectTemplateType, TemplateCategoryDef[]>> = {
  "customHome": [
    {
      "name": "Site Work",
      "percent": 7.6,
      "items": [
        {
          "title": "Permits and Municipal Fees",
          "share": 1.6
        },
        {
          "title": "Architecture and Engineering",
          "share": 1.4
        },
        {
          "title": "Soil Testing and Geotech Report",
          "share": 0.4
        },
        {
          "title": "Water, Sewer and Utility Fees",
          "share": 1.3
        },
        {
          "title": "Septic or Well (Rural Builds)",
          "share": 0.3
        },
        {
          "title": "Demo, Clearing and Grading",
          "share": 1.6
        },
        {
          "title": "Site Protection, Erosion Control and Other",
          "share": 1
        }
      ]
    },
    {
      "name": "Foundation",
      "percent": 10.5,
      "items": [
        {
          "title": "Excavation and Export",
          "share": 2.1
        },
        {
          "title": "Footings and Foundation Walls",
          "share": 4.6
        },
        {
          "title": "Slab, Waterproofing and Drains",
          "share": 2.6
        },
        {
          "title": "Foundation Insulation and Rigid Board",
          "share": 0.6
        },
        {
          "title": "Foundation Other",
          "share": 0.6
        }
      ]
    },
    {
      "name": "Framing",
      "percent": 16.6,
      "items": [
        {
          "title": "Lumber and Framing Package",
          "share": 8.4
        },
        {
          "title": "Framing Labor",
          "share": 4
        },
        {
          "title": "Trusses, Beams and Steel",
          "share": 2
        },
        {
          "title": "Engineered Beams (LVL, Ridge, Steel)",
          "share": 0.8
        },
        {
          "title": "Sheathing, Hardware and Connectors",
          "share": 1.4
        }
      ]
    },
    {
      "name": "Exterior",
      "percent": 13.4,
      "items": [
        {
          "title": "Exterior Wall Finish",
          "share": 5
        },
        {
          "title": "Stone Veneer or Accent Finish",
          "share": 0.8
        },
        {
          "title": "Roofing",
          "share": 3.6
        },
        {
          "title": "Gutters and Downspouts",
          "share": 0.4
        },
        {
          "title": "Windows, Exterior Doors and Garage Door",
          "share": 3.5
        },
        {
          "title": "Exterior Trim, Soffit and Fascia",
          "share": 0.1
        }
      ]
    },
    {
      "name": "Major Systems",
      "percent": 19.2,
      "items": [
        {
          "title": "Plumbing Rough-In",
          "share": 5.9
        },
        {
          "title": "Electrical Rough-In",
          "share": 6
        },
        {
          "title": "HVAC Equipment and Ductwork",
          "share": 6
        },
        {
          "title": "Smart Home and Low-Voltage Wiring",
          "share": 0.6
        },
        {
          "title": "Solar, EV and Generator Pre-Wiring",
          "share": 0.5
        },
        {
          "title": "Radon Mitigation and Other Systems",
          "share": 0.2
        }
      ]
    },
    {
      "name": "Interior Finishes",
      "percent": 24.1,
      "items": [
        {
          "title": "Insulation",
          "share": 1.5
        },
        {
          "title": "Drywall",
          "share": 3.1
        },
        {
          "title": "Interior Doors, Trim and Millwork",
          "share": 2.7
        },
        {
          "title": "Painting",
          "share": 2.4
        },
        {
          "title": "Lighting Fixtures",
          "share": 1.2
        },
        {
          "title": "Cabinets and Countertops",
          "share": 4.2
        },
        {
          "title": "Appliances",
          "share": 1.7
        },
        {
          "title": "Flooring",
          "share": 3.3
        },
        {
          "title": "Plumbing Fixtures",
          "share": 1.8
        },
        {
          "title": "Fireplace and Specialty",
          "share": 0.5
        },
        {
          "title": "Window Treatments and Blinds",
          "share": 0.7
        },
        {
          "title": "Closet Systems and Built-Ins",
          "share": 0.6
        },
        {
          "title": "Bath Accessories and Mirrors",
          "share": 0.4
        }
      ]
    },
    {
      "name": "Final Steps",
      "percent": 6.5,
      "items": [
        {
          "title": "Landscaping",
          "share": 2
        },
        {
          "title": "Deck, Patio and Porches",
          "share": 1
        },
        {
          "title": "Driveway and Walkways",
          "share": 2.1
        },
        {
          "title": "Termite Pretreatment and Final Inspections",
          "share": 0.3
        },
        {
          "title": "Final Clean and Closeout",
          "share": 0.8
        },
        {
          "title": "Punch List Reserve",
          "share": 0.3
        }
      ]
    },
    {
      "name": "Other",
      "percent": 2.1,
      "items": [
        {
          "title": "General Conditions",
          "share": 0.9
        },
        {
          "title": "Builder's Risk and Owner's Insurance",
          "share": 0.5
        },
        {
          "title": "Construction Loan Interest",
          "share": 0.4
        },
        {
          "title": "Safety and Miscellaneous",
          "share": 0.3
        }
      ]
    }
  ],
  "poolBackyard": [
    {
      "name": "Design & Permits",
      "percent": 6,
      "items": [
        {
          "title": "Design and Layout",
          "share": 2
        },
        {
          "title": "Engineering and Permits",
          "share": 3
        },
        {
          "title": "Survey and Markout",
          "share": 1
        }
      ]
    },
    {
      "name": "Demo & Site Prep",
      "percent": 8,
      "items": [
        {
          "title": "Demo and Clearing",
          "share": 3
        },
        {
          "title": "Access, Protection and Haul-Off",
          "share": 3
        },
        {
          "title": "Rough Grading",
          "share": 2
        }
      ]
    },
    {
      "name": "Excavation",
      "percent": 10,
      "items": [
        {
          "title": "Pool Excavation",
          "share": 7
        },
        {
          "title": "Soil Export and Backfill",
          "share": 3
        }
      ]
    },
    {
      "name": "Pool Shell",
      "percent": 20,
      "items": [
        {
          "title": "Steel, Forms and Shell",
          "share": 11
        },
        {
          "title": "Waterproofing and Interior Finish",
          "share": 4.5
        },
        {
          "title": "Tile and Coping Prep",
          "share": 2.5
        },
        {
          "title": "Pool Cover (Manual or Automatic)",
          "share": 2
        }
      ]
    },
    {
      "name": "Plumbing & Equipment",
      "percent": 16,
      "items": [
        {
          "title": "Pool Plumbing",
          "share": 5.5
        },
        {
          "title": "Pump, Filter and Heater",
          "share": 5.5
        },
        {
          "title": "Automation and Startup",
          "share": 3.5
        },
        {
          "title": "Solar Pool Heating (Optional)",
          "share": 1.5
        }
      ]
    },
    {
      "name": "Electrical & Lighting",
      "percent": 7,
      "items": [
        {
          "title": "Electrical Rough-In",
          "share": 3.5
        },
        {
          "title": "Pool and Landscape Lighting",
          "share": 2.5
        },
        {
          "title": "Outdoor Speakers and AV Rough-In",
          "share": 1
        }
      ]
    },
    {
      "name": "Hardscape",
      "percent": 15,
      "items": [
        {
          "title": "Patio Base and Pavers",
          "share": 9
        },
        {
          "title": "Coping and Masonry",
          "share": 4
        },
        {
          "title": "Drainage",
          "share": 2
        }
      ]
    },
    {
      "name": "Landscaping & Finish",
      "percent": 12,
      "items": [
        {
          "title": "Plantings, Sod and Mulch",
          "share": 4.5
        },
        {
          "title": "Pool Safety Fence and Self-Closing Gate",
          "share": 3.5
        },
        {
          "title": "Pool Alarm and Safety Equipment",
          "share": 0.5
        },
        {
          "title": "Furniture, Cleanup and Final",
          "share": 3.5
        }
      ]
    },
    {
      "name": "Outdoor Living",
      "percent": 6,
      "items": [
        {
          "title": "Outdoor Kitchen or Bar",
          "share": 2.5
        },
        {
          "title": "Pergola or Shade Structure",
          "share": 1
        },
        {
          "title": "Outdoor TV and Entertainment",
          "share": 0.8
        },
        {
          "title": "Outdoor Heaters and Misters",
          "share": 0.5
        },
        {
          "title": "Fire Feature or Specialty Extras",
          "share": 1.2
        }
      ]
    }
  ],
  "deckPatio": [
    {
      "name": "Design & Permits",
      "percent": 8,
      "items": [
        {
          "title": "Design and Permit",
          "share": 5
        },
        {
          "title": "Survey or Plot Plan",
          "share": 3
        }
      ]
    },
    {
      "name": "Demo & Prep",
      "percent": 10,
      "items": [
        {
          "title": "Demo and Disposal",
          "share": 5
        },
        {
          "title": "Layout, Protection and Access",
          "share": 5
        }
      ]
    },
    {
      "name": "Footings",
      "percent": 14,
      "items": [
        {
          "title": "Excavation and Footings",
          "share": 9
        },
        {
          "title": "Concrete and Inspection",
          "share": 5
        }
      ]
    },
    {
      "name": "Framing",
      "percent": 22,
      "items": [
        {
          "title": "Framing Material",
          "share": 12
        },
        {
          "title": "Framing Labor",
          "share": 10
        }
      ]
    },
    {
      "name": "Decking / Surface",
      "percent": 20,
      "items": [
        {
          "title": "Decking or Paver Material",
          "share": 10
        },
        {
          "title": "Installation",
          "share": 7
        },
        {
          "title": "Built-In Benches or Seating",
          "share": 2
        },
        {
          "title": "Built-In Planters",
          "share": 1
        }
      ]
    },
    {
      "name": "Rails, Stairs & Finish",
      "percent": 18,
      "items": [
        {
          "title": "Railings",
          "share": 7
        },
        {
          "title": "Stairs (Deck)",
          "share": 5
        },
        {
          "title": "Ground-Level Stairs or Landing Pad",
          "share": 1.5
        },
        {
          "title": "Pergola or Shade Structure (Optional)",
          "share": 1.5
        },
        {
          "title": "Trim, Fascia and Finish",
          "share": 3
        }
      ]
    },
    {
      "name": "Lighting & Cleanup",
      "percent": 8,
      "items": [
        {
          "title": "Lighting",
          "share": 2.5
        },
        {
          "title": "Outdoor Electrical and GFI Outlets",
          "share": 2
        },
        {
          "title": "Outdoor Ceiling Fan (If Covered)",
          "share": 0.5
        },
        {
          "title": "Final Clean and Punch List",
          "share": 3
        }
      ]
    }
  ],
  "kitchenRemodel": [
    {
      "name": "Design & Permits",
      "percent": 7,
      "items": [
        {
          "title": "Design and Cabinet Plan",
          "share": 2.5
        },
        {
          "title": "Building Permit",
          "share": 1
        },
        {
          "title": "Electrical and Plumbing Permits",
          "share": 1
        },
        {
          "title": "Selections and Project Coordination",
          "share": 2.5
        }
      ]
    },
    {
      "name": "Demo & Protection",
      "percent": 8,
      "items": [
        {
          "title": "Demo",
          "share": 3
        },
        {
          "title": "Dust Protection and Containment",
          "share": 1
        },
        {
          "title": "Dumpster and Haul-Off",
          "share": 2
        },
        {
          "title": "Temporary Kitchen Setup",
          "share": 2
        }
      ]
    },
    {
      "name": "Rough MEP",
      "percent": 17,
      "items": [
        {
          "title": "Plumbing Rough-In",
          "share": 5
        },
        {
          "title": "Pot Filler and Specialty Plumbing",
          "share": 1
        },
        {
          "title": "Electrical Rough-In",
          "share": 6
        },
        {
          "title": "Range Hood Venting",
          "share": 1
        },
        {
          "title": "HVAC Adjustments",
          "share": 4
        }
      ]
    },
    {
      "name": "Walls & Prep",
      "percent": 10,
      "items": [
        {
          "title": "Framing and Layout Changes",
          "share": 3
        },
        {
          "title": "Drywall",
          "share": 4
        },
        {
          "title": "Paint Prep and Paint",
          "share": 3
        }
      ]
    },
    {
      "name": "Cabinets & Counters",
      "percent": 30,
      "items": [
        {
          "title": "Base and Upper Cabinetry",
          "share": 14
        },
        {
          "title": "Pantry (Walk-In or Cabinet)",
          "share": 3
        },
        {
          "title": "Cabinet Hardware and Soft-Close Upgrades",
          "share": 1
        },
        {
          "title": "Countertops (Quartz, Granite or Stone)",
          "share": 8
        },
        {
          "title": "Backsplash (Tile)",
          "share": 4
        }
      ]
    },
    {
      "name": "Appliances & Fixtures",
      "percent": 18,
      "items": [
        {
          "title": "Major Appliances (Range, Fridge, Dishwasher)",
          "share": 8
        },
        {
          "title": "Range Hood / Vent",
          "share": 2
        },
        {
          "title": "Wine Fridge or Beverage Center",
          "share": 1.5
        },
        {
          "title": "Sink and Faucet",
          "share": 2
        },
        {
          "title": "Garbage Disposal and Trash Pull-Out",
          "share": 0.5
        },
        {
          "title": "Lighting Fixtures (Pendants, Recessed)",
          "share": 2.5
        },
        {
          "title": "Under-Cabinet Lighting",
          "share": 1.5
        }
      ]
    },
    {
      "name": "Flooring & Finish",
      "percent": 10,
      "items": [
        {
          "title": "Flooring",
          "share": 6
        },
        {
          "title": "Trim and Baseboards",
          "share": 1.5
        },
        {
          "title": "Final Clean and Punch List",
          "share": 2.5
        }
      ]
    }
  ],
  "bathroomRemodel": [
    {
      "name": "Design & Permits",
      "percent": 6,
      "items": [
        {
          "title": "Design and Layout",
          "share": 2.5
        },
        {
          "title": "Building Permit",
          "share": 1
        },
        {
          "title": "Electrical and Plumbing Permits",
          "share": 1
        },
        {
          "title": "Skylight or Sun Tunnel (Optional)",
          "share": 1.5
        }
      ]
    },
    {
      "name": "Demo & Protection",
      "percent": 8,
      "items": [
        {
          "title": "Demo",
          "share": 4
        },
        {
          "title": "Protection and Haul-Off",
          "share": 3
        },
        {
          "title": "Pocket Door or Layout Cut-In",
          "share": 1
        }
      ]
    },
    {
      "name": "Rough MEP",
      "percent": 20,
      "items": [
        {
          "title": "Plumbing Rough-In",
          "share": 8
        },
        {
          "title": "Electrical Rough-In",
          "share": 5
        },
        {
          "title": "Ventilation and Exhaust Fan",
          "share": 2
        },
        {
          "title": "Heated Floor System (Optional)",
          "share": 3
        },
        {
          "title": "Steam Unit (Optional)",
          "share": 2
        }
      ]
    },
    {
      "name": "Waterproofing",
      "percent": 12,
      "items": [
        {
          "title": "Shower Pan",
          "share": 4
        },
        {
          "title": "Waterproofing Membrane System",
          "share": 4
        },
        {
          "title": "Curbless / Linear Drain Conversion",
          "share": 2
        },
        {
          "title": "Shower Niche and Bench",
          "share": 2
        }
      ]
    },
    {
      "name": "Tile & Stone",
      "percent": 22,
      "items": [
        {
          "title": "Tile Material",
          "share": 9
        },
        {
          "title": "Tile Labor",
          "share": 10
        },
        {
          "title": "Stone Thresholds and Trim",
          "share": 3
        }
      ]
    },
    {
      "name": "Vanity & Fixtures",
      "percent": 22,
      "items": [
        {
          "title": "Vanity",
          "share": 5
        },
        {
          "title": "Sink and Faucet",
          "share": 2.5
        },
        {
          "title": "Shower / Tub Fixtures",
          "share": 4
        },
        {
          "title": "Smart Toilet or Bidet Upgrade",
          "share": 3
        },
        {
          "title": "Glass Enclosure",
          "share": 4
        },
        {
          "title": "Towel Warmer",
          "share": 1
        },
        {
          "title": "Linen Storage / Cabinetry",
          "share": 2.5
        }
      ]
    },
    {
      "name": "Paint & Finish",
      "percent": 10,
      "items": [
        {
          "title": "Paint and Drywall Repair",
          "share": 4
        },
        {
          "title": "Mirror",
          "share": 2
        },
        {
          "title": "Bath Accessories (TP Holder, Hooks, Hardware)",
          "share": 1.5
        },
        {
          "title": "Final Clean and Punch List",
          "share": 2.5
        }
      ]
    }
  ],
  "basementFinish": [
    {
      "name": "Design & Permits",
      "percent": 6,
      "items": [
        {
          "title": "Design and Layout",
          "share": 2.5
        },
        {
          "title": "Building Permit",
          "share": 1.5
        },
        {
          "title": "Electrical and Plumbing Permits",
          "share": 1
        },
        {
          "title": "Inspection Fees",
          "share": 1
        }
      ]
    },
    {
      "name": "Framing",
      "percent": 16,
      "items": [
        {
          "title": "Layout and Framing",
          "share": 9
        },
        {
          "title": "Egress Window (Required for Bedrooms)",
          "share": 5
        },
        {
          "title": "Pocket Doors and Specialty Framing",
          "share": 2
        }
      ]
    },
    {
      "name": "MEP Rough-In",
      "percent": 22,
      "items": [
        {
          "title": "Plumbing Rough-In",
          "share": 6
        },
        {
          "title": "Electrical Rough-In",
          "share": 6
        },
        {
          "title": "HVAC and Ductwork",
          "share": 6
        },
        {
          "title": "Sump Pump (New or Replace)",
          "share": 1.5
        },
        {
          "title": "Dehumidifier and Drainage",
          "share": 1.5
        },
        {
          "title": "Theater and Speaker Pre-Wiring (Optional)",
          "share": 1
        }
      ]
    },
    {
      "name": "Insulation & Drywall",
      "percent": 18,
      "items": [
        {
          "title": "Wall and Ceiling Insulation",
          "share": 6
        },
        {
          "title": "Vapor Barrier",
          "share": 2
        },
        {
          "title": "Soundproofing (Between Floors)",
          "share": 2
        },
        {
          "title": "Drywall (or Drop Ceiling Option)",
          "share": 8
        }
      ]
    },
    {
      "name": "Flooring & Trim",
      "percent": 16,
      "items": [
        {
          "title": "Flooring (LVP, Carpet, Tile)",
          "share": 9
        },
        {
          "title": "Gym Area Flooring and Mirrors",
          "share": 2
        },
        {
          "title": "Doors and Trim",
          "share": 5
        }
      ]
    },
    {
      "name": "Bath / Wet Bar / Specialty",
      "percent": 14,
      "items": [
        {
          "title": "Bath Fixtures",
          "share": 5
        },
        {
          "title": "Wet Bar Cabinetry and Counters",
          "share": 4
        },
        {
          "title": "Wet Bar Appliances (Beverage Fridge, Ice Maker)",
          "share": 2
        },
        {
          "title": "Home Theater AV and Cinema Seating",
          "share": 2
        },
        {
          "title": "Built-Ins and Specialty Storage",
          "share": 1
        }
      ]
    },
    {
      "name": "Paint & Closeout",
      "percent": 8,
      "items": [
        {
          "title": "Paint",
          "share": 4
        },
        {
          "title": "Final Clean and Punch List",
          "share": 4
        }
      ]
    }
  ],
  "majorRenovation": [
    {
      "name": "Soft Costs",
      "percent": 10,
      "items": [
        {
          "title": "Architect",
          "share": 2.2
        },
        {
          "title": "Structural and MEP Engineering",
          "share": 1.3
        },
        {
          "title": "Permits and Filings",
          "share": 1.2
        },
        {
          "title": "Owner's Representative / Project Management",
          "share": 0.8
        },
        {
          "title": "Builder's Risk and Owner's Insurance",
          "share": 0.7
        },
        {
          "title": "Construction Loan Interest",
          "share": 0.8
        },
        {
          "title": "Temporary Living (Rental or Hotel)",
          "share": 2.5
        },
        {
          "title": "Storage / POD Rental and Moving",
          "share": 0.5
        }
      ]
    },
    {
      "name": "Demo & Remediation",
      "percent": 12,
      "items": [
        {
          "title": "Demo",
          "share": 5
        },
        {
          "title": "Asbestos / Lead / Mold Remediation",
          "share": 4
        },
        {
          "title": "Protection and Dust Containment",
          "share": 1.5
        },
        {
          "title": "Dumpster and Haul-Off",
          "share": 1.5
        }
      ]
    },
    {
      "name": "Structural",
      "percent": 12,
      "items": [
        {
          "title": "Framing",
          "share": 5
        },
        {
          "title": "Steel and Engineered Beams",
          "share": 3.5
        },
        {
          "title": "Structural Repairs and Sistering",
          "share": 3.5
        }
      ]
    },
    {
      "name": "Exterior",
      "percent": 9,
      "items": [
        {
          "title": "Windows and Exterior Doors",
          "share": 4
        },
        {
          "title": "Roofing",
          "share": 3
        },
        {
          "title": "Siding and Trim",
          "share": 2
        }
      ]
    },
    {
      "name": "MEP Systems",
      "percent": 21,
      "items": [
        {
          "title": "Plumbing",
          "share": 7
        },
        {
          "title": "Electrical (Including Service Upgrade)",
          "share": 7
        },
        {
          "title": "HVAC and Ductwork",
          "share": 5
        },
        {
          "title": "Smart Home and Low-Voltage",
          "share": 1
        },
        {
          "title": "Solar / EV / Generator Pre-Wiring",
          "share": 1
        }
      ]
    },
    {
      "name": "Interior Finishes",
      "percent": 28,
      "items": [
        {
          "title": "Insulation",
          "share": 1.5
        },
        {
          "title": "Drywall",
          "share": 3.5
        },
        {
          "title": "Trim, Doors and Millwork",
          "share": 3
        },
        {
          "title": "Kitchen Cabinets and Countertops",
          "share": 5.5
        },
        {
          "title": "Bath Vanities and Fixtures",
          "share": 3
        },
        {
          "title": "Tile",
          "share": 2.5
        },
        {
          "title": "Flooring",
          "share": 3
        },
        {
          "title": "Paint",
          "share": 2
        },
        {
          "title": "Appliances",
          "share": 2.5
        },
        {
          "title": "Lighting Fixtures",
          "share": 0.8
        },
        {
          "title": "Window Treatments and Closet Systems",
          "share": 0.7
        }
      ]
    },
    {
      "name": "Final & Site",
      "percent": 8,
      "items": [
        {
          "title": "Landscaping Repair",
          "share": 2.5
        },
        {
          "title": "Driveway and Walkways",
          "share": 2
        },
        {
          "title": "Final Inspections and C/O",
          "share": 1
        },
        {
          "title": "Final Clean",
          "share": 1
        },
        {
          "title": "Punch List Reserve",
          "share": 1.5
        }
      ]
    }
  ],
  "addition": [
    {
      "name": "Soft Costs",
      "percent": 8,
      "items": [
        {
          "title": "Architect",
          "share": 2.5
        },
        {
          "title": "Structural Engineering",
          "share": 1.5
        },
        {
          "title": "Survey and Site Plan",
          "share": 1
        },
        {
          "title": "Building Permit",
          "share": 1.5
        },
        {
          "title": "Electrical and Plumbing Permits",
          "share": 1
        },
        {
          "title": "Builder's Risk Insurance",
          "share": 0.5
        }
      ]
    },
    {
      "name": "Site & Foundation",
      "percent": 17,
      "items": [
        {
          "title": "Excavation",
          "share": 5
        },
        {
          "title": "Footings",
          "share": 5
        },
        {
          "title": "Foundation Walls and Slab",
          "share": 6
        },
        {
          "title": "Septic / Sewer Upgrades (If Applicable)",
          "share": 1
        }
      ]
    },
    {
      "name": "Framing",
      "percent": 17,
      "items": [
        {
          "title": "Framing Material",
          "share": 7
        },
        {
          "title": "Framing Labor",
          "share": 6
        },
        {
          "title": "Roofline Tie-In and Existing Roof Modification",
          "share": 3
        },
        {
          "title": "Wall Cut-In to Existing Structure",
          "share": 1
        }
      ]
    },
    {
      "name": "Exterior",
      "percent": 13,
      "items": [
        {
          "title": "Roofing (Tied Into Existing)",
          "share": 4
        },
        {
          "title": "Windows and Doors",
          "share": 4
        },
        {
          "title": "Siding (Matching Existing)",
          "share": 4
        },
        {
          "title": "Exterior Paint Touch-Up",
          "share": 1
        }
      ]
    },
    {
      "name": "MEP Rough-In",
      "percent": 18,
      "items": [
        {
          "title": "Plumbing Rough-In",
          "share": 5
        },
        {
          "title": "Electrical Rough-In",
          "share": 5
        },
        {
          "title": "Electrical Service Upgrade (Panel)",
          "share": 2
        },
        {
          "title": "HVAC Equipment",
          "share": 4
        },
        {
          "title": "HVAC Modifications to Existing System",
          "share": 2
        }
      ]
    },
    {
      "name": "Interior Finishes",
      "percent": 21,
      "items": [
        {
          "title": "Insulation",
          "share": 1.5
        },
        {
          "title": "Drywall",
          "share": 4
        },
        {
          "title": "Trim, Doors and Millwork",
          "share": 3
        },
        {
          "title": "Flooring (Matching Existing)",
          "share": 5
        },
        {
          "title": "Paint",
          "share": 3
        },
        {
          "title": "Lighting Fixtures",
          "share": 1.5
        },
        {
          "title": "Cabinets / Built-Ins (If Applicable)",
          "share": 3
        }
      ]
    },
    {
      "name": "Final & Site",
      "percent": 6,
      "items": [
        {
          "title": "Landscaping Repair",
          "share": 2
        },
        {
          "title": "Final Inspections and C/O",
          "share": 1
        },
        {
          "title": "Final Clean",
          "share": 1.5
        },
        {
          "title": "Punch List Reserve",
          "share": 1.5
        }
      ]
    }
  ],
  "garageBuild": [
    {
      "name": "Design & Permits",
      "percent": 6,
      "items": [
        {
          "title": "Design and Plans",
          "share": 2.5
        },
        {
          "title": "Permits and Survey",
          "share": 2.5
        },
        {
          "title": "Inspection Fees",
          "share": 1
        }
      ]
    },
    {
      "name": "Site & Foundation",
      "percent": 22,
      "items": [
        {
          "title": "Excavation and Site Prep",
          "share": 5
        },
        {
          "title": "Footings",
          "share": 5
        },
        {
          "title": "Slab and Vapor Barrier",
          "share": 9
        },
        {
          "title": "Apron and Driveway Transition",
          "share": 3
        }
      ]
    },
    {
      "name": "Framing",
      "percent": 22,
      "items": [
        {
          "title": "Framing Material",
          "share": 11
        },
        {
          "title": "Framing Labor",
          "share": 9
        },
        {
          "title": "Engineered Beams and Headers",
          "share": 2
        }
      ]
    },
    {
      "name": "Exterior",
      "percent": 18,
      "items": [
        {
          "title": "Roofing",
          "share": 7
        },
        {
          "title": "Siding",
          "share": 7
        },
        {
          "title": "Windows",
          "share": 2
        },
        {
          "title": "Service Door",
          "share": 2
        }
      ]
    },
    {
      "name": "Garage Doors",
      "percent": 10,
      "items": [
        {
          "title": "Garage Doors",
          "share": 6
        },
        {
          "title": "Insulated Door Upgrade",
          "share": 2
        },
        {
          "title": "Openers and Smart Controls",
          "share": 2
        }
      ]
    },
    {
      "name": "Electrical & Finish",
      "percent": 16,
      "items": [
        {
          "title": "Electrical Rough-In and Service",
          "share": 5
        },
        {
          "title": "EV Charger Circuit (240V)",
          "share": 1.5
        },
        {
          "title": "220V Workshop Outlets",
          "share": 1
        },
        {
          "title": "Lighting (LED Fixtures)",
          "share": 2
        },
        {
          "title": "Utility Sink (If Applicable)",
          "share": 1
        },
        {
          "title": "Insulation and Drywall",
          "share": 4
        },
        {
          "title": "Storage Systems (Slat Wall, Cabinets)",
          "share": 1.5
        }
      ]
    },
    {
      "name": "Final Site",
      "percent": 6,
      "items": [
        {
          "title": "Driveway Tie-In",
          "share": 3
        },
        {
          "title": "Landscaping Touch-Up",
          "share": 1.5
        },
        {
          "title": "Final Clean and Punch",
          "share": 1.5
        }
      ]
    }
  ],
  "landscapingHardscape": [
    {
      "name": "Design & Permits",
      "percent": 5,
      "items": [
        {
          "title": "Design and Layout",
          "share": 3
        },
        {
          "title": "Permits and Survey",
          "share": 2
        }
      ]
    },
    {
      "name": "Site Prep",
      "percent": 14,
      "items": [
        {
          "title": "Clearing and Demo",
          "share": 3
        },
        {
          "title": "Tree Removal (Often the #1 Surprise Cost)",
          "share": 4
        },
        {
          "title": "Tree Care and Pruning (Keepers)",
          "share": 1
        },
        {
          "title": "Rough Grading",
          "share": 4
        },
        {
          "title": "Drainage Prep and Sediment Control",
          "share": 2
        }
      ]
    },
    {
      "name": "Drainage & Utilities",
      "percent": 13,
      "items": [
        {
          "title": "Drainage System",
          "share": 5
        },
        {
          "title": "Irrigation",
          "share": 5
        },
        {
          "title": "Smart Irrigation Controller",
          "share": 1
        },
        {
          "title": "Lighting Rough-In",
          "share": 2
        }
      ]
    },
    {
      "name": "Hardscape",
      "percent": 32,
      "items": [
        {
          "title": "Pavers and Patio",
          "share": 14
        },
        {
          "title": "Retaining and Sitting Walls",
          "share": 8
        },
        {
          "title": "Steps and Masonry",
          "share": 6
        },
        {
          "title": "Edging and Bordering",
          "share": 2
        },
        {
          "title": "Stone Veneer and Specialty Masonry",
          "share": 2
        }
      ]
    },
    {
      "name": "Plantings",
      "percent": 18,
      "items": [
        {
          "title": "Trees",
          "share": 5
        },
        {
          "title": "Shrubs and Perennials",
          "share": 4
        },
        {
          "title": "Sod, Seed or Hydroseed",
          "share": 4
        },
        {
          "title": "Soil Amendments and Topsoil",
          "share": 3
        },
        {
          "title": "Mulch and Bed Prep",
          "share": 2
        }
      ]
    },
    {
      "name": "Lighting & Features",
      "percent": 11,
      "items": [
        {
          "title": "Landscape Lighting Fixtures",
          "share": 4
        },
        {
          "title": "Fire or Water Features",
          "share": 4
        },
        {
          "title": "Outdoor Furniture and Pots",
          "share": 3
        }
      ]
    },
    {
      "name": "Finish",
      "percent": 7,
      "items": [
        {
          "title": "Final Clean and Restoration",
          "share": 4
        },
        {
          "title": "Punch List and Walkthrough",
          "share": 3
        }
      ]
    }
  ]
}

export interface SeededCategory { name: string; sortOrder: number; targetBudget: number }
export interface SeededLineItem { categoryName: string; costCode: string; title: string; budget: number; notes: string }
export interface BudgetDraft { categories: SeededCategory[]; lineItems: SeededLineItem[] }

const pad2 = (n: number) => String(n).padStart(2, '0')
const roundDollars = (n: number) => Math.round(n)

/** Build categories + line items for a template type and construction budget. Category
 *  target = percent × budget; each line item gets its category's amount × (share / Σshare),
 *  rounded to whole dollars. Returns empty for 'custom', unknown types, or budget <= 0. */
export function makeBudgetDraft(type: ProjectTemplateType, constructionBudget: number): BudgetDraft {
  const defs = PROJECT_TEMPLATES[type]
  if (!defs || constructionBudget <= 0) return { categories: [], lineItems: [] }
  const categories: SeededCategory[] = []
  const lineItems: SeededLineItem[] = []
  defs.forEach((cat, ci) => {
    const categoryAmount = Math.max(0, constructionBudget) * (cat.percent / 100)
    const totalShare = cat.items.reduce((s, i) => s + i.share, 0) || 1
    let catTotal = 0
    cat.items.forEach((item, ii) => {
      const amount = roundDollars((categoryAmount * item.share) / totalShare)
      catTotal += amount
      lineItems.push({
        categoryName: cat.name,
        costCode: `${pad2(ci + 1)}${pad2(ii + 1)}`,
        title: item.title,
        budget: amount,
        notes: item.notes ?? '',
      })
    })
    categories.push({ name: cat.name, sortOrder: ci, targetBudget: catTotal })
  })
  return { categories, lineItems }
}
