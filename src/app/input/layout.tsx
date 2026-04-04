import { InputHeader } from "@/components/input/input-header"

export const dynamic = "force-dynamic"

export default function InputLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <div className="bg-background flex min-h-svh flex-col">
      <InputHeader />
      <div className="flex flex-1 flex-col">{children}</div>
    </div>
  )
}
