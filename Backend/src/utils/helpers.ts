import { Prisma } from "@prisma/client";

type Numeric = number | Prisma.Decimal

export const generateOTP = (length = 6): string => {
  const digits = '0123456789';
  let otp = '';
  for (let i = 0; i < length; i++) {
    otp += digits[Math.floor(Math.random() * 10)];
  }
  return otp;
};

export const formatPhoneNumber = (phone: string): string => {
  // Implement phone number formatting logic for your region
  return phone.replace(/\D/g, '');
};

export function asNumber(x: number | Prisma.Decimal): number {
  return typeof x === 'number' ? x : x.toNumber();
}


export function addDecimal(a: number | Prisma.Decimal, b: number | Prisma.Decimal) {
  if (typeof a === "number") a = new Prisma.Decimal(a);
  if (typeof b === "number") b = new Prisma.Decimal(b);
  return a.plus(b);
}

export function subDecimal(a: number | Prisma.Decimal, b: number | Prisma.Decimal) {
  if (typeof a === "number") a = new Prisma.Decimal(a);
  if (typeof b === "number") b = new Prisma.Decimal(b);
  return a.minus(b);
}