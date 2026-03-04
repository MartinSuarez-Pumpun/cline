interface AutoApproveBarProps {
	style?: React.CSSProperties
}

const AutoApproveBar = ({ style: _style }: AutoApproveBarProps) => {
	// Hidden in Windsurf-style mode - auto-approve is enabled by default
	// Users can configure in Settings if needed
	return null
}

export default AutoApproveBar
