export interface User {
  id: number;
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  enabled: boolean;
  role: string; // ADMIN | OPERATOR | VISITOR
}

export interface UserCreatePayload {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password: string;
  enabled: boolean;
  role: string;
}

export interface UserUpdatePayload {
  firstName: string;
  lastName: string;
  username: string;
  email: string;
  password?: string;
  enabled: boolean;
  role: string;
}
