Feature: Signing up and logging in
  People sign up as a client or a builder, confirm their email address, and log in and out.
  The sample accounts from db/seed.sql all use the password CasaFida123.

  Scenario: Logging in with a sample account
    Given I open Casa Fida
    When I log in with "emma.clarke@example.com" and the password "CasaFida123"
    Then I see the heading "Hi, Emma"

  Scenario: A wrong password is refused
    Given I open Casa Fida
    When I log in with "emma.clarke@example.com" and the password "not-my-password"
    Then I see the error "Wrong email or password."

  Scenario: Signing up as a client and confirming the email address
    Given I open Casa Fida
    When I sign up as a client named "Ana Popescu" with the email "ana@example.com"
    Then I see the heading "Hi, Ana"
    And I see "Confirm your email address so proposals from builders come straight into your account. We sent a link to ana@example.com."
    And "ana@example.com" gets an email "Confirm your email address for Casa Fida"
    When I open the link in the email "Confirm your email address for Casa Fida" to "ana@example.com"
    Then I see the heading "Email address confirmed"
    And I see "ana@example.com is confirmed. Thanks!"
    When I click "Go to Casa Fida"
    Then I see the heading "Hi, Ana"
    And I don't see "Confirm your email address"

  Scenario: Sending the confirmation link again
    Given I open Casa Fida
    And I sign up as a client named "Ana Popescu" with the email "ana@example.com"
    When I click "Send it again"
    Then I see "Sent. Check your inbox."
    And "ana@example.com" gets 2 emails "Confirm your email address for Casa Fida"

  Scenario: Choosing how to use Casa Fida
    Given I open Casa Fida
    When I click "Create an account"
    And I fill in the form:
      | Your name | Ana Popescu     |
      | Email     | ana@example.com |
      | Password  | NewPassword123  |
    And I click "Create account"
    Then I see the error "Choose whether you need work done or are a builder."

  Scenario: Passwords need at least 8 characters
    Given I open Casa Fida
    When I click "Create an account"
    And I choose "I need work done"
    And I fill in the form:
      | Your name | Ana Popescu     |
      | Email     | ana@example.com |
      | Password  | short           |
    And I click "Create account"
    Then I see the error "Your password needs at least 8 characters."

  Scenario: An email address has only one account
    Given I open Casa Fida
    When I sign up as a client named "Emma Clarke" with the email "emma.clarke@example.com"
    Then I see the error "An account with this email already exists. Try logging in."

  Scenario: A new builder sets up their business profile before anything else
    Given I open Casa Fida
    When I sign up as a builder named "Ion Rusu" with the email "ion@example.com"
    Then I see "Step 2 of 2"
    And I see the heading "Set up your business profile"
    When I fill in the form:
      | Business name       | Rusu Renovations                |
      | About your business | Small renovations, done well.   |
      | Area you work in    | Chișinău                        |
    And I click "Save and continue"
    Then I see the error "Choose between 1 and 6 trades."
    When I choose the trades "Renovations, Painting"
    And I click "Save and continue"
    Then I see the heading "Hi, Ion"
    And I see "Confirm your email address to send quotes and proposals. We sent a link to ion@example.com."

  Scenario: Logging out
    Given I am logged in as Emma
    When I open "Account" in the menu
    And I click "Log out"
    Then I see the heading "Log in"

  Scenario: After logging in, the page that was asked for opens
    Given I open "/projects/1" in a new browser
    Then I see the heading "Log in"
    When I log in with "emma.clarke@example.com" and the password "CasaFida123"
    Then I see the heading "Rear extension & open-plan kitchen"

  Scenario: An address that leads nowhere
    Given I am logged in as Emma
    When I go to "/no-such-page"
    Then I see "There's nothing at this address."
    When I click "Go to the home page"
    Then I see the heading "Hi, Emma"
