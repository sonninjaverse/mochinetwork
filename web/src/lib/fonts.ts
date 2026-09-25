import localFont from "next/font/local";

export const inter = localFont({
  src: "../fonts/Inter.ttf",
  variable: "--font-inter",
  weight: "100 900",
  display: "swap",
});

export const instrumentSerif = localFont({
  src: "../fonts/InstrumentSerif.ttf",
  variable: "--font-instrument",
  display: "swap",
});
