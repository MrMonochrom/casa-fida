Feature: Proposals
  A builder sends a proposal for work already agreed with a client: the work, its price and stages.
  The client accepts or declines it on Casa Fida. Clients without an account get an email invite.

  Scenario: Accepting a proposal
    Given I am logged in as David
    When I open the project "Kitchen remodel"
    Then I see "Proposal from Shah Kitchen & Bath"
    And I see "$46,800"
    When I click "Accept proposal"
    And I confirm with "Accept proposal"
    Then I see "In progress"
    And I see the tab "Changes & invoices"
    And Priya gets an email "Proposal accepted: Kitchen remodel"

  Scenario: Declining a proposal
    Given I am logged in as David
    When I open the project "Kitchen remodel"
    And I click "Decline"
    And I confirm with "Decline proposal"
    Then I see "You declined this proposal."
    And Priya gets an email "Proposal declined: Kitchen remodel"
    When I switch to Priya's browser
    And I open the project "Kitchen remodel"
    Then I see "David Nguyen declined this proposal."

  Scenario: A proposal goes straight into the account of a client who has one
    Given I am logged in as Marcus
    When I send a proposal:
      | Name            | Noah Patel                      |
      | Email           | noah.patel@example.com          |
      | Title           | Basement bathroom               |
      | What's included | A shower room in the basement.  |
      | Price           | 14,500                          |
    Then I see the heading "Basement bathroom"
    And I see "Waiting for Noah Patel to accept. They can see it in their account."
    And Noah gets an email "Reid & Sons Construction sent you a project proposal"
    When I switch to Noah's browser
    Then I see the to-do "Proposal to review" about "Basement bathroom"

  Scenario: Inviting a client who is new to Casa Fida
    Given I am logged in as Marcus
    When I send a proposal:
      | Name            | Ana Popescu                    |
      | Email           | ana@example.com                |
      | Title           | Attic bedroom                  |
      | What's included | A bedroom and shower upstairs. |
      | Price           | 32,000                         |
    Then I see "We emailed an invite to ana@example.com. Once they sign up, they can accept the proposal."
    When I open the link in the email "Reid & Sons Construction sent you a project proposal" to "ana@example.com" in a new browser
    Then I see "Project proposal"
    And I see the heading "Attic bedroom"
    And I see "Reid & Sons Construction (Marcus Reid) sent you a proposal on Casa Fida."
    And the field "Your name" shows "Ana Popescu"
    And the field "Email" shows "ana@example.com"
    When I fill in "Password" with "NewPassword123"
    And I click "Create account"
    Then I see "Proposal from Reid & Sons Construction"
    And I don't see "Confirm your email address"
    When I click "Accept proposal"
    And I confirm with "Accept proposal"
    Then I see "In progress"
    And Marcus gets an email "Proposal accepted: Attic bedroom"

  Scenario: A client whose email address isn't confirmed logs in from the invite
    Given Noah hasn't confirmed his email address
    And I am logged in as Marcus
    When I send a proposal:
      | Name            | Noah Patel                     |
      | Email           | noah.patel@example.com         |
      | Title           | Basement bathroom              |
      | What's included | A shower room in the basement. |
      | Price           | 14,500                         |
    Then I see "We emailed an invite to noah.patel@example.com."
    When I open the link in Noah's email "Reid & Sons Construction sent you a project proposal" in a new browser
    And I log in from the invite as Noah
    Then I see the heading "Basement bathroom"
    And I see "Proposal from Reid & Sons Construction"

  Scenario: A builder can't take a client's invite
    Given I am logged in as Marcus
    And I have sent a proposal "Attic bedroom" to "Ana Popescu" at "ana@example.com"
    When I switch to Priya's browser
    And I open the link in the email "Reid & Sons Construction sent you a project proposal" to "ana@example.com"
    Then I see "You're logged in as a builder (priya.shah@example.com). Proposals are for client accounts: log out, then open the link again to sign up as a client."

  Scenario: A new invite link replaces the one in the email
    Given I am logged in as Marcus
    And I have sent a proposal "Attic bedroom" to "Ana Popescu" at "ana@example.com"
    When I click "Get a link to send yourself"
    Then I see "The link in the first email no longer works."
    When I open the link in the email "Reid & Sons Construction sent you a project proposal" to "ana@example.com" in a new browser
    Then I see the heading "This link doesn't work any more"
    And I see "This invite link has expired or was already used. Ask your builder for a new one."
    When I open the invite link Marcus copied in a new browser
    Then I see the heading "Attic bedroom"

  Scenario: Withdrawing a proposal
    Given I am logged in as Priya
    When I open the project "Kitchen remodel"
    And I click "Withdraw proposal"
    And I confirm with "Withdraw proposal"
    Then I see the heading "Projects"
    And I don't see "Kitchen remodel"

  Scenario: Changing a proposal's price before it's accepted
    Given I am logged in as Priya
    When I open the project "Kitchen remodel"
    And I click "Edit details"
    And I fill in "Price" with "48,000"
    And I click "Save changes"
    Then I see "$48,000"
    When I switch to David's browser
    And I open the project "Kitchen remodel"
    Then I see "$48,000"

  Scenario: Choosing a proposal's stages
    Given I am logged in as Marcus
    When I open "Projects" in the menu
    And I click "Send a proposal"
    And I fill in the form:
      | Name            | Noah Patel                     |
      | Email           | noah.patel@example.com         |
      | Title           | Basement bathroom              |
      | What's included | A shower room in the basement. |
      | Price           | 14,500                         |
    And I click "+ Demolition"
    And I click "+ Framing"
    And I add my own stage "Tile & fixtures"
    And I click "Move Tile & fixtures up"
    And I click "Send proposal"
    Then the stages are, in order:
      | Demolition      |
      | Tile & fixtures |
      | Framing         |

  Scenario: A proposal needs a price
    Given I am logged in as Marcus
    When I open "Projects" in the menu
    And I click "Send a proposal"
    And I click "Send proposal"
    Then I see the error "Enter the price for the work, like 46,800."

  Scenario: Proposals only go to clients
    Given I am logged in as Marcus
    When I send a proposal:
      | Name            | Priya Shah              |
      | Email           | priya.shah@example.com  |
      | Title           | Kitchen                 |
      | What's included | A kitchen.              |
      | Price           | 10,000                  |
    Then I see the error "That email belongs to a builder account. Proposals can only go to clients."
