"use client";

import { usePathname } from "next/navigation";
import Navigation from "./Navigation";

export default function ConditionalNavigation() {
  const pathname = usePathname();
  
  // Hide navigation on the home/startup page
  if (pathname === "/") {
    return null;
  }
  
  return <Navigation />;
}

