import React from "react";

export function Icon({ name = "book", size = 20, ...props }) {
  const paths = {
    book: (
      <>
        <path d="M12 5c-3-2-6-2-9-1v15c3-1 6-1 9 1 3-2 6-2 9-1V4c-3-1-6-1-9 1Z" />
        <path d="M12 5v15" />
      </>
    ),
    sun: (
      <>
        <circle cx="12" cy="12" r="4" />
        <path d="M12 2v2m0 16v2M2 12h2m16 0h2M5 5l1.5 1.5m11 11L19 19M5 19l1.5-1.5m11-11L19 5" />
      </>
    ),
    sunrise: (
      <>
        <path d="M3 17h18M6 17a6 6 0 0 1 12 0M12 2v7m-3-4 3-3 3 3M3 10l2 2m14 0 2-2M3 21h18" />
      </>
    ),
    sunset: (
      <>
        <path d="M3 17h18M6 17a6 6 0 0 1 12 0M12 2v7m-3-3 3 3 3-3M3 10l2 2m14 0 2-2M3 21h18" />
      </>
    ),
    moon: <path d="M20.5 14A9 9 0 0 1 10 3a9 9 0 1 0 10.5 11Z" />,
    repeat: (
      <>
        <path d="M20 8a8 8 0 0 0-14-3L3 8m0-5v5h5M4 16a8 8 0 0 0 14 3l3-3m0 5v-5h-5" />
      </>
    ),
    settings: (
      <>
        <path d="M4 7h16M4 17h16" />
        <circle cx="9" cy="7" r="3" />
        <circle cx="15" cy="17" r="3" />
      </>
    ),
    plus: <path d="M12 5v14M5 12h14" />,
    check: <path d="m5 12 4 4L19 6" />,
    arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
    close: <path d="m6 6 12 12M6 18 18 6" />,
    spark: (
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5Z" />
    ),
    shield: (
      <>
        <path d="M12 3 4 6v6c0 5 8 9 8 9s8-4 8-9V6Z" />
        <path d="m8 12 3 3 5-6" />
      </>
    ),
    info: (
      <>
        <circle cx="12" cy="12" r="9" />
        <path d="M12 11v5" />
        <circle cx="12" cy="8" r="0.5" fill="currentColor" />
      </>
    ),
    user: (
      <>
        <circle cx="12" cy="8" r="4" />
        <path d="M4 21c1.5-4 5-5.5 8-5.5s6.5 1.5 8 5.5" />
      </>
    ),
    download: (
      <>
        <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
      </>
    ),
    device: (
      <>
        <rect x="6" y="2.5" width="12" height="19" rx="2.5" />
        <path d="M11 18.5h2" />
      </>
    ),
    cloud: (
      <path d="M17.5 18.5a4.2 4.2 0 0 0 .8-8.3 5.8 5.8 0 0 0-11.3-1.2 4.5 4.5 0 0 0 .7 9.5Z" />
    ),
  };
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...props}
    >
      {paths[name] || paths.book}
    </svg>
  );
}
