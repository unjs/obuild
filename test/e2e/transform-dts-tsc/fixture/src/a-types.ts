import type { UserID } from "./b-types.js";
import type { Status } from "./c-types.ts";

// Interfaces
export interface User {
  id: UserID;
  name: string;
  email: string;
  status: Status;
  profile?: Profile;
}

export interface Profile {
  bio: string;
  age: number;
  interests: string[];
}
