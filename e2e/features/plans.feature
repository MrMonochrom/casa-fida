Feature: Free and Pro plans for builders
  Builders start on Free and can try Pro once, free for 14 days. Pro emails each new job in their
  trades as it's posted and allows more trades and quotes.

  Scenario: A builder on Free tries Pro
    Given I am logged in as Marcus
    When I open "Account" in the menu
    Then I see "You're on the free plan."
    And the plans compare like this:
      | Emails about new jobs in your trades | Once a day | As each is posted |
      | New quotes a day                     | 30         | 100               |
      | Trades you can offer                 | 6          | 12                |
    And I see "New jobs in your trades, once a day"
    When I click "Try Pro free for 14 days"
    Then I see that I'm on Pro for 14 days
    And I don't see the button "Try Pro free for 14 days"
    And I see "(up to 12)"
    And I see "New jobs in your trades, as each is posted"

  Scenario: A builder on Pro
    Given I am logged in as Priya
    When I open "Account" in the menu
    Then I see "You're on Pro."
    And I don't see the button "Try Pro free for 14 days"

  Scenario: Builders on Free offer up to 6 trades
    Given I am logged in as Grace
    When I open "Account" in the menu
    Then I see "(up to 6)"
    When I choose the trades "Kitchens, Bathrooms, Flooring"
    Then the trade "Roofing" can't be chosen
    When I click "Save profile"
    Then I see "Saved."

  Scenario: Builders on Pro hear about each new job straight away
    Given I am logged in as Noah
    When I post a job "New kitchen" for "Kitchens" in "Chișinău"
    Then Priya gets an email "New job: New kitchen"

  Scenario: Builders on Free don't get an email for each new job
    Given I am logged in as Noah
    When I post a job "Paint the fence" for "Painting" in "Littleton, CO"
    Then Grace gets no email "New job: Paint the fence"

  Scenario: When Pro ends, only the first 6 trades count
    Given I am logged in as Priya
    When I open "Account" in the menu
    And I choose the trades "Renovations, Painting, Carpentry, Plumbing, Roofing"
    And I click "Save profile"
    Then I see "Saved."
    When Priya's Pro ended yesterday
    And I reload the page
    Then I see "You're on the free plan."
    And I see "Your plan covers 6 trades, so these don't count for now: Plumbing, Roofing. Remove trades until you have 6 to save."
