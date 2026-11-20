export interface StaffMember {
  readonly id: number;
  readonly name: string;
  /** 1..N; higher cooks faster and serves more reliably. */
  readonly level: number;
  /** Cost in Fish Coins per day to retain. */
  readonly wage: number;
  /** Cook stations this member can operate at once. */
  readonly stations: number;
}

export type StaffRoster = readonly StaffMember[];

export interface StaffModel {
  readonly roster: StaffRoster;
}

export function createStaff(id: number, name: string, level = 1): StaffMember {
  return {
    id,
    name,
    level,
    wage: 20 + (level - 1) * 10,
    stations: 1 + Math.floor(level / 3),
  };
}

export function createStaffModel(roster: StaffRoster = []): StaffModel {
  return { roster };
}

/** Total daily wages of the roster. */
export function dailyWages(staff: StaffModel): number {
  return staff.roster.reduce((sum, member) => sum + member.wage, 0);
}

/** Combined station capacity; at least 1 even with no staff (the player cooks). */
export function stationCapacity(staff: StaffModel, playerStations: number): number {
  return playerStations + staff.roster.reduce((sum, member) => sum + member.stations, 0);
}
