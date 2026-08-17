"use client";

import { useState } from "react";

/**
 * Groups the 7 contiguous useState calls for the queue filter bar.
 * Called at the same hook slot as the original `filterSearch` useState
 * so overall hook call order is preserved.
 */
export function useFilterState() {
  const [filterSearch, setFilterSearch] = useState("");
  const [filterSchool, setFilterSchool] = useState("");
  const [filterGrade, setFilterGrade] = useState("");
  const [filterSemester, setFilterSemester] = useState("");
  const [filterPublisher, setFilterPublisher] = useState("");
  const [filterCollection, setFilterCollection] = useState("");
  const [showFilters, setShowFilters] = useState(false);

  return {
    filterSearch, setFilterSearch,
    filterSchool, setFilterSchool,
    filterGrade, setFilterGrade,
    filterSemester, setFilterSemester,
    filterPublisher, setFilterPublisher,
    filterCollection, setFilterCollection,
    showFilters, setShowFilters,
  };
}
