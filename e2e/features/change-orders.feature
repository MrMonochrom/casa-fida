Feature: Change orders
  The builder proposes changes to the work, price or schedule. Nothing changes until the client
  approves.

  Scenario: Approving a change order
    Given I am logged in as Emma
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    Then the "Total price" is "$151,700"
    When I click "Approve" on the change order "Add a skylight over the kitchen"
    Then I see "The price changes by +$2,850, to $154,550, and the schedule by +3 days."
    When I confirm with "Approve change"
    Then the change order "Add a skylight over the kitchen" is "Approved"
    And the "Total price" is "$154,550"
    And the "Approved changes" is "+$6,050"
    And Marcus gets an email "Change approved: Add a skylight over the kitchen"

  Scenario: Declining a change order
    Given I am logged in as Emma
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    And I click "Decline" on the change order "Add a skylight over the kitchen"
    And I confirm with "Decline change"
    Then the change order "Add a skylight over the kitchen" is "Declined"
    And the "Total price" is "$151,700"
    And Marcus gets an email "Change declined: Add a skylight over the kitchen"

  Scenario: Sending a change order
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    And I click "New change order"
    And I fill in the form:
      | Title           | Two more outlets                       |
      | What changes    | Two outlets on the family room's north wall. |
      | Price change    | 450                                    |
      | Schedule change | 1                                      |
    And I click "Send to client"
    Then the change order "Two more outlets" is "Waiting for approval"
    And Emma gets an email "Change to approve: Two more outlets"
    When I switch to Emma's browser
    And I open the project "Rear extension & open-plan kitchen"
    Then the tab "Changes & invoices" says "3 waiting for you"

  Scenario: Taking work out lowers the price
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    And I click "New change order"
    And I fill in the form:
      | Title        | No garden lights            |
      | What changes | The garden lights come out. |
      | Price change | -1,000                      |
    And I click "Send to client"
    Then the change order "No garden lights" shows "−$1,000"
    When I switch to Emma's browser
    And I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    And I click "Approve" on the change order "No garden lights"
    And I confirm with "Approve change"
    Then the "Total price" is "$150,700"

  Scenario: Withdrawing a change order
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    And I click "Withdraw" on the change order "Add a skylight over the kitchen"
    And I confirm with "Withdraw"
    Then the change order "Add a skylight over the kitchen" is "Withdrawn"

  Scenario: A price change is an amount
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    And I click "New change order"
    And I fill in the form:
      | Title        | Something |
      | What changes | Something |
      | Price change | lots      |
    And I click "Send to client"
    Then I see the error "Enter how much the price changes, like 2,850 or -500. Use 0 if it stays the same."
