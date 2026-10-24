Feature: Account settings
  Everyone can change their details, password and which emails they get. Builders also keep their
  business profile here.

  Scenario: Changing my name and phone number
    Given I am logged in as Noah
    When I open "Account" in the menu
    And I fill in the form:
      | Name  | Noel Patel     |
      | Phone | (303) 555-0199 |
    And I click "Save details"
    Then I see "Saved."
    When I open "Home" in the menu
    Then I see the heading "Hi, Noel"

  Scenario: A phone number has to look like one
    Given I am logged in as Noah
    When I open "Account" in the menu
    And I fill in "Phone" with "call me"
    And I click "Save details"
    Then I see the error "Please enter a valid phone number, or leave it empty."

  Scenario: The email address can't be changed
    Given I am logged in as Noah
    When I open "Account" in the menu
    Then the field "Email" shows "noah.patel@example.com"
    And the field "Email" can't be changed
    And I see "Your email can't be changed."

  Scenario: Turning off emails about new quotes
    Given I am logged in as Noah
    When I open "Account" in the menu
    And I untick "New quotes on your jobs"
    And I click "Save"
    Then I see "Saved."
    When Grace sends a quote of "38,500" for "Finish the basement"
    Then Noah gets no email "New quote for Finish the basement"

  Scenario: A builder changes their business profile
    Given I am logged in as Grace
    When I open "Account" in the menu
    And I fill in "Headline" with "Basements finished in six weeks."
    And I click "Save profile"
    Then I see "Saved."
    When I click "See it as clients do"
    Then I see "Basements finished in six weeks."
    And I see the link "Edit your profile"

  Scenario: Clients have no plan or business profile
    Given I am logged in as Noah
    When I open "Account" in the menu
    Then I see "Client account · member since"
    And I don't see "Your plan"
    And I don't see "Business profile"
