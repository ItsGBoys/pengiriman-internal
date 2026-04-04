import { createServerClient } from "@supabase/ssr"
import { NextResponse, type NextRequest } from "next/server"
import { fetchProfileRole } from "@/lib/supabase/profile-role"

function isDashboardPath(pathname: string) {
  return pathname === "/dashboard" || pathname.startsWith("/dashboard/")
}

function isInputPath(pathname: string) {
  return pathname === "/input" || pathname.startsWith("/input/")
}

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value)
          )
          supabaseResponse = NextResponse.next({ request })
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options)
          )
        },
      },
    }
  )

  const {
    data: { user },
  } = await supabase.auth.getUser()

  const pathname = request.nextUrl.pathname

  if (!user) {
    const url = request.nextUrl.clone()
    url.pathname = "/login"
    url.searchParams.set("next", pathname)
    return NextResponse.redirect(url)
  }

  const profile = await fetchProfileRole(supabase, user.id)

  if (!profile.ok) {
    return NextResponse.redirect(new URL("/", request.url))
  }

  const role = profile.role

  if (isDashboardPath(pathname) && role !== "manager") {
    return NextResponse.redirect(new URL("/", request.url))
  }

  if (isInputPath(pathname) && role !== "staff") {
    return NextResponse.redirect(new URL("/", request.url))
  }

  return supabaseResponse
}

export const config = {
  matcher: ["/dashboard", "/dashboard/:path*", "/input", "/input/:path*"],
}
