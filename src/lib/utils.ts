import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
import { Team } from "../types/game";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function findPlayerClub(teams: Team[], playerId: string): Team | undefined {
  return teams.find(team => team.division > 0 && team.players.some(player => player.id === playerId));
}
