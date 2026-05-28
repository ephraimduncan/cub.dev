cask "cub" do
  version "0.5.0"

  on_arm do
    sha256 "8e720f1bae9739814b9c45d1a897fbd240e0f4a74acd2da298ab2cb2aada2c18"

    url "https://github.com/ephraimduncan/cub.dev/releases/download/v#{version}/Cub_#{version}_aarch64.dmg"
  end
  on_intel do
    sha256 "31d4f3f5d4b947090701e41fba0dbf430625b6cb0042ed838cff15de3c85eb08"

    url "https://github.com/ephraimduncan/cub.dev/releases/download/v#{version}/Cub_#{version}_x64.dmg"
  end

  name "Cub"
  desc "Simple git client with AI code review built in"
  homepage "https://github.com/ephraimduncan/cub.dev"

  livecheck do
    url "https://github.com/ephraimduncan/cub.dev/releases/latest"
    strategy :github_latest
  end

  # The app is ad-hoc signed (no Developer ID / notarization). Without
  # the postflight below, macOS Gatekeeper blocks first launch from the
  # cask download.
  auto_updates false
  depends_on macos: :big_sur

  app "Cub.app"
  binary "#{appdir}/Cub.app/Contents/MacOS/cub"

  postflight do
    # Strip the quarantine attribute placed by macOS on cask downloads so
    # the ad-hoc signed app can launch without right-click → Open.
    system_command "/usr/bin/xattr",
                   args: ["-dr", "com.apple.quarantine", "#{appdir}/Cub.app"],
                   sudo: false
  end

  zap trash: [
    "~/.cub",
    "~/Library/Application Support/com.ephraimduncan.cub",
    "~/Library/Caches/com.ephraimduncan.cub",
    "~/Library/Preferences/com.ephraimduncan.cub.plist",
    "~/Library/Saved Application State/com.ephraimduncan.cub.savedState",
    "~/Library/WebKit/com.ephraimduncan.cub",
  ]

  caveats <<~EOS
    Cub's MCP sidecar requires Bun. Install one of:

      brew tap oven-sh/bun && brew install bun
      curl -fsSL https://bun.sh/install | bash

    Cub auto-detects Bun at /opt/homebrew/bin/bun, /usr/local/bin/bun,
    ~/.bun/bin/bun, ~/.local/bin/bun, or anywhere on PATH.
  EOS
end
