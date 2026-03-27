# Two-Column Grouping Editor for Filters & Equipment

## Problem

The current settings UI relies on an auto-suggestion algorithm to propose merges, but many valid groupings aren't detected (e.g., AT60ED_0.8x / AT60ED_Reducer, Askar140APO_0.8x / Askar_140APO). Users need a way to manually group any raw names discovered from FITS headers. They also need to dismiss irrelevant suggestions and remove items from existing groups.

## Design

### Layout

Each settings section (Filters tab, Equipment tab) uses a two-column layout:

**Left column — "Ungrouped"**: All raw names from the DB that aren't part of any group, shown with frame counts. Multi-select via checkboxes. "Group Selected" button at bottom, disabled until 2+ items are checked.

**Right column — "Groups"**: Each group shows the canonical name prominently with aliases as removable badges (x button). For filters, color picker stays inline on the canonical name. Removing all aliases deletes the group entry.

**Suggestions banner** stays at top. Each suggestion gets a "Dismiss" button alongside "Merge." Dismissed suggestions persist in settings DB.

### Interactions

**Creating a group:**
1. Check 2+ items in ungrouped column
2. Click "Group Selected"
3. Item with highest frame count is pre-selected as canonical; user can click any item to change
4. Confirm — items move to right column as a new group

**Modifying a group:**
- "x" on any alias badge removes it (moves back to ungrouped)
- Select ungrouped items, click "Add to" on an existing group
- Removing all aliases removes the group entry

**Dismissing suggestions:**
- "Dismiss" button on each suggestion
- Stored as `dismissed_suggestions: list[list[str]]` in settings DB (sorted name lists)
- Backend filters dismissed groups from suggestions response
- No un-dismiss UI — user can manually group from ungrouped column instead

**Saving:**
- Explicit "Save" button commits all changes
- All grouping/ungrouping is local state until saved

### Backend Changes

**New endpoint**: `GET /settings/discovered/{section}` (section: `filters`, `cameras`, `telescopes`)
- Returns all distinct raw values from DB with frame counts
- Query: `SELECT <column>, COUNT(*) FROM images WHERE <column> IS NOT NULL GROUP BY <column>`

**Schema change**: Add `dismissed_suggestions` field to `UserSettings` model (JSONB, default empty list). Each entry is a sorted list of names.

**Suggestions endpoint**: Filter out groups where all members appear in any dismissed entry.

No changes to existing PUT endpoints — they already handle the group data structures.

### Component Structure

- New `GroupingEditor` component shared by FiltersTab and EquipmentTab
  - Props: discovered items, current groups, section type, onSave callback
  - For filters: includes color picker on canonical names
- `SuggestionsBanner`: add `onDismiss` callback prop
- Equipment tab: two instances of GroupingEditor (cameras, telescopes) with separate discovered items

### Data Flow

```
GET /settings/discovered/cameras → raw names + counts
GET /settings → current groups
                    ↓
          GroupingEditor component
          (local state: checked items, groups)
                    ↓
          User clicks Save
                    ↓
          PUT /settings/equipment (or /filters)
```
