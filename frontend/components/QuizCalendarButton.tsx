"use client"

import dynamic from "next/dynamic"

const AddToCalendarButton = dynamic(
  () =>
    import("add-to-calendar-button-react").then(
      (mod: any) => mod.AddToCalendarButton || mod.default
    ),
  { ssr: false }
) as any

interface QuizCalendarButtonProps {
  title: string
  eventStart: Date
  eventEnd: Date
  roomCode: string
  eventUrl: string
  isMiniapp: boolean
  isBaseMiniapp: boolean
  googleCalendarUrl: string | null
  openExternalUrl: (url: string | null) => void
  onBaseMiniappClick?: () => void
}

export default function QuizCalendarButton({
  title,
  eventStart,
  eventEnd,
  roomCode,
  eventUrl,
  isMiniapp,
  isBaseMiniapp,
  googleCalendarUrl,
  openExternalUrl,
  onBaseMiniappClick,
}: QuizCalendarButtonProps) {
  const startDate = eventStart.toISOString().slice(0, 10)
  const startTime = eventStart.toISOString().slice(11, 16)
  const endDate = eventEnd.toISOString().slice(0, 10)
  const endTime = eventEnd.toISOString().slice(11, 16)

  return (
    <div
      style={{
        padding: "0.9rem",
        borderRadius: "0.5rem",
        backgroundColor: "rgba(121, 90, 255, 0.3)",
        border: "1px solid #795AFF",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
          marginBottom: "0.5rem",
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: "0.5rem",
            color: "white",
            fontWeight: 500,
          }}
        >
          <span>📅</span>
          <span>Add to calendar</span>
        </div>
      </div>

      {/* On web: full calendar widget */}
      {!isMiniapp && (
        <AddToCalendarButton
          name={title}
          options={["Google", "Apple", "Outlook.com", "iCal"]}
          startDate={startDate}
          startTime={startTime}
          endDate={endDate}
          endTime={endTime}
          timeZone={
            typeof window !== "undefined"
              ? Intl.DateTimeFormat().resolvedOptions().timeZone
              : "UTC"
          }
          description={`Join the Hoot quiz – Room ${roomCode}`}
          location={eventUrl}
          buttonStyle="round"
          trigger="click"
        />
      )}

      {/* In MiniApps: open external calendar URL instead */}
      {isMiniapp && googleCalendarUrl && (
        <button
          type="button"
          onClick={() => {
            if (isBaseMiniapp && onBaseMiniappClick) {
              onBaseMiniappClick()
            } else {
              openExternalUrl(googleCalendarUrl)
            }
          }}
          style={{
            width: "100%",
            padding: "0.6rem 0.9rem",
            borderRadius: "9999px",
            border: "1px solid rgba(255,255,255,0.6)",
            backgroundColor: "rgba(17,24,39,0.9)",
            color: "white",
            fontSize: "0.8rem",
            fontWeight: 500,
            textAlign: "center",
            cursor: "pointer",
          }}
        >
          Open calendar in browser
        </button>
      )}
    </div>
  )
}


