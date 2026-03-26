import {
  BookOpenTextIcon,
  BookSearchIcon,
  GlobeIcon,
  LibraryBigIcon,
  NotebookPenIcon,
  TerminalIcon,
  WrenchIcon
} from "lucide-react"

export function getToolIcon(toolName: string, className: string) {
  switch (toolName.trim().toLowerCase()) {
    case "websearch":
      return <GlobeIcon className={className} />
    case "bashexecution":
      return <TerminalIcon className={className} />
    case "read":
      return <BookOpenTextIcon className={className} />
    case "skillread":
      return <LibraryBigIcon className={className} />
    case "writeworkspacefile":
      return <NotebookPenIcon className={className} />
    case "memorysearch":
    case "memoryget":
      return <BookSearchIcon className={className} />
    default:
      return <WrenchIcon className={className} />
  }
}
