Feature: Invoices
  The builder bills the project in parts. Clients pay the way they agreed, and the builder marks each
  invoice paid when the money arrives.

  Scenario: Sending an invoice
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    And I click "New invoice"
    And I fill in the form:
      | What it's for | Roofing complete |
      | Amount        | 20,000           |
    And I click "Send invoice"
    Then the invoice "Roofing complete" for "$20,000" is "Due"
    And the "Not invoiced yet" is "$57,450"
    And Emma gets an email "Invoice #4 from Reid & Sons Construction"

  Scenario: Billing everything that's left
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    And I click "New invoice"
    And I fill in "What it's for" with "Final payment"
    And I click "Bill all of it"
    Then the field "Amount" shows "77450"
    When I click "Send invoice"
    Then the invoice "Final payment" for "$77,450" is "Due"
    And the "Not invoiced yet" is "$0"
    And I don't see the button "New invoice"

  Scenario: An invoice can't be for more than is left
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    And I click "New invoice"
    And I fill in the form:
      | What it's for | Too much |
      | Amount        | 100,000  |
    And I click "Send invoice"
    Then I see the error "That's more than is left to invoice ($77,450)."

  Scenario: Marking an invoice paid
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    And I click "Mark paid" on the invoice "Framing complete"
    And I confirm with "Mark paid"
    Then the invoice "Framing complete" for "$29,700" is "Paid"
    And the "Paid" is "$74,250"
    And the "Invoiced, not yet paid" is "$0"
    When I switch to Emma's browser
    And I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    Then the invoice "Framing complete" for "$29,700" is "Paid"

  Scenario: Voiding an invoice
    Given I am logged in as Marcus
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    And I click "Void" on the invoice "Framing complete"
    And I confirm with "Void invoice"
    Then the invoice "Framing complete" for "$29,700" is "Void"
    And the "Not invoiced yet" is "$107,150"

  Scenario: An invoice past its due date is overdue
    Given the invoice "Framing complete" was due yesterday
    And I am logged in as Emma
    Then I see the to-do "1 invoice overdue" about "Rear extension & open-plan kitchen"
    When I open the project "Rear extension & open-plan kitchen"
    And I open the tab "Changes & invoices"
    Then the invoice "Framing complete" for "$29,700" is "Overdue"

  Scenario: The client sees what's waiting for them
    Given I am logged in as Emma
    When I open the project "Rear extension & open-plan kitchen"
    Then the tab "Changes & invoices" says "2 waiting for you"
    And the menu says "Projects" has "2 things waiting for you"
