package internal

type MenuNode struct {
	Text     map[string]string
	Options  []MenuOption
	Action   string
	IsEnd    bool
}

type MenuOption struct {
	Key   string
	Label map[string]string
	Next  string
}

var MenuTree = map[string]MenuNode{
	"root": {
		Text: map[string]string{
			"en": "Welcome to InsurePortal\n",
			"ha": "Barka da zuwa InsurePortal\n",
			"yo": "Kaabo si InsurePortal\n",
			"ig": "Nnọọ na InsurePortal\n",
		},
		Options: []MenuOption{
			{Key: "1", Label: map[string]string{"en": "Check Policy", "ha": "Duba Inshorar"}, Next: "check_policy"},
			{Key: "2", Label: map[string]string{"en": "File Claim", "ha": "Nemi Biya"}, Next: "file_claim"},
			{Key: "3", Label: map[string]string{"en": "Pay Premium", "ha": "Biya Premium"}, Next: "pay_premium"},
			{Key: "4", Label: map[string]string{"en": "Find Agent", "ha": "Nemo Wakili"}, Next: "find_agent"},
			{Key: "5", Label: map[string]string{"en": "Change Language", "ha": "Canza Harshe"}, Next: "language"},
			{Key: "0", Label: map[string]string{"en": "Exit"}, Next: "exit"},
		},
	},
	"check_policy": {
		Text: map[string]string{"en": "Enter your Policy Number:", "ha": "Shigar da lambar inshorar:"},
		Action: "lookup_policy",
	},
	"file_claim": {
		Text: map[string]string{"en": "Select Claim Type:\n"},
		Options: []MenuOption{
			{Key: "1", Label: map[string]string{"en": "Motor Accident"}, Next: "claim_motor"},
			{Key: "2", Label: map[string]string{"en": "Health/Medical"}, Next: "claim_health"},
			{Key: "3", Label: map[string]string{"en": "Property Damage"}, Next: "claim_property"},
			{Key: "4", Label: map[string]string{"en": "Life Insurance"}, Next: "claim_life"},
			{Key: "0", Label: map[string]string{"en": "Back"}, Next: "root"},
		},
	},
	"pay_premium": {
		Text: map[string]string{"en": "Enter Policy Number to Pay:", "ha": "Shigar da lambar don biya:"},
		Action: "initiate_payment",
	},
	"find_agent": {
		Text: map[string]string{"en": "Enter your State (e.g., Lagos, Kano):", "ha": "Shigar da jihar ku:"},
		Action: "find_agent_by_state",
	},
	"language": {
		Text: map[string]string{"en": "Select Language:\n"},
		Options: []MenuOption{
			{Key: "1", Label: map[string]string{"en": "English"}, Next: "set_lang_en"},
			{Key: "2", Label: map[string]string{"en": "Hausa"}, Next: "set_lang_ha"},
			{Key: "3", Label: map[string]string{"en": "Yoruba"}, Next: "set_lang_yo"},
			{Key: "4", Label: map[string]string{"en": "Igbo"}, Next: "set_lang_ig"},
		},
	},
	"exit": {
		Text:  map[string]string{"en": "Thank you for using InsurePortal. Goodbye!", "ha": "Nagode da amfani da InsurePortal. Sai anjima!"},
		IsEnd: true,
	},
}

func RenderMenu(nodeKey string, lang string) string {
	node, ok := MenuTree[nodeKey]
	if !ok {
		return "Error: Invalid menu"
	}
	text := node.Text[lang]
	if text == "" {
		text = node.Text["en"]
	}
	for _, opt := range node.Options {
		label := opt.Label[lang]
		if label == "" {
			label = opt.Label["en"]
		}
		text += opt.Key + ". " + label + "\n"
	}
	return text
}
